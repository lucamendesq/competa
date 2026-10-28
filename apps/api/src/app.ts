import { Context, Layer, ManagedRuntime } from 'effect';
import { EventEmitter2 } from './lib/event-emitter.js';
import { HttpServer } from 'effect/http';
import env from './config/env.js';
import { run } from './effect/runtime.js';
import { ping } from './health.js';
import { serverLayer } from './http/server.js';
import { registerMessagingListeners } from './modules/messaging/listeners.js';
import { cronsLayer } from './modules/requests/crons.js';
import { deadlineCron } from './modules/requests/deadline.cron.js';
import { remindersCron } from './modules/requests/reminders.cron.js';

export interface RunningApp {
  readonly url: string;
  runDeadlineSweep(): Promise<void>;
  close(): Promise<void>;
}

export async function createApp(options?: {
  readonly port?: number;
  readonly trustProxy?: boolean;
}): Promise<RunningApp> {
  const port = options?.port ?? env.PORT;
  /* Atrás de um reverse proxy o processo vê o IP DELE, e todo balde de throttle vira um só
   * para o mundo inteiro — um cliente barulhento 429a a base. Só em produção: confiar no
   * X-Forwarded-For sem proxy à frente deixa qualquer cliente forjar o próprio IP. */
  const trustProxy = options?.trustProxy ?? env.NODE_ENV === 'production';

  /* UMA instância por app: os listeners de messaging registram nela, e uma cópia engoliria
   * todo evento emitido por rota. Mesmas opções do `EventEmitterModule.forRoot()`. */
  const events = new EventEmitter2();
  registerMessagingListeners(events);

  const deadlines = deadlineCron(events);
  const reminders = remindersCron(events);

  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      serverLayer({
        port,
        trustProxy,
        ping,
        events,
        scanDeadlines: (scope) => run(deadlines.scan(scope)),
        runReminders: (scope) => run(reminders.run(scope)),
      }),
      cronsLayer({
        deadlines: { daily: () => run(deadlines.daily()) },
        reminders: { scheduled: () => run(reminders.scheduled()) },
      }),
    ),
  );

  const server = Context.get(await runtime.context(), HttpServer.HttpServer);
  const url = HttpServer.formatAddress(server.address)
    .replace('[::]', '127.0.0.1')
    .replace('[::1]', '127.0.0.1');

  return {
    url,
    /** O job diário não tem rota HTTP; as suites o chamam por aqui. */
    runDeadlineSweep: () => run(deadlines.daily()),
    /* Dois crons e um socket: sem isto, um SIGTERM do orquestrador derruba o processo no
     * meio de uma varredura. `removeAllListeners` é o que o `onApplicationShutdown` do
     * do emissor de eventos do Nest fazia. */
    close: async () => {
      await runtime.dispose();
      events.removeAllListeners();
    },
  };
}

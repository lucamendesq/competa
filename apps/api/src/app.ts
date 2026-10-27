import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import env from './config/env.js';
import { AppLayer } from './effect/runtime.js';
import { ping } from './health.js';
import { serverLayer } from './http/server.js';
import { DbPool } from './infra/database/effect.js';
import { Events } from './lib/events.service.js';
import { cronsLayer } from './modules/requests/crons.js';
import { DeadlineScan } from './modules/requests/deadline.cron.js';
import { Reminders } from './modules/requests/reminders.cron.js';

/** As duas varreduras diárias, sobre os serviços do app. */
const CronsLive = Layer.unwrap(
  Effect.gen(function* () {
    const deadlines = yield* DeadlineScan;
    const reminders = yield* Reminders;

    return cronsLayer({ deadlines: deadlines.daily(), reminders: reminders.scheduled() });
  }),
);

export type AppOptions = {
  readonly port: number;
  /* Atrás de um reverse proxy o processo vê o IP DELE, e todo balde de throttle vira um só
   * para o mundo inteiro — um cliente barulhento 429a a base. Só em produção: confiar no
   * X-Forwarded-For sem proxy à frente deixa qualquer cliente forjar o próprio IP. */
  readonly trustProxy: boolean;
};

/** O app inteiro: servidor, crons e a árvore de serviços, que é construída uma vez e
 *  desmontada na ordem inversa — o servidor para de aceitar, os crons são interrompidos, os
 *  listeners em voo terminam e só então o pool fecha. Falta só dizer de quem é o pool. */
export const AppLive = (options: AppOptions) =>
  Layer.mergeAll(serverLayer({ ...options, ping }), CronsLive).pipe(Layer.provideMerge(AppLayer));

export interface RunningApp {
  readonly url: string;
  runDeadlineSweep(): Promise<void>;
  /** Espera os listeners em voo. Para spec que afirma que algo NÃO foi enviado. */
  drainEvents(): Promise<void>;
  close(): Promise<void>;
}

/** Um app no processo, com o pool emprestado: a suíte sobe dezenas destes. A API de verdade
 *  sobe por `main.ts`, que é dona do pool. */
export async function createApp(options?: Partial<AppOptions>): Promise<RunningApp> {
  const runtime = ManagedRuntime.make(
    AppLive({
      port: options?.port ?? env.PORT,
      trustProxy: options?.trustProxy ?? env.NODE_ENV === 'production',
    }).pipe(Layer.provide(DbPool.layerBorrowed)),
  );

  const server = Context.get(await runtime.context(), HttpServer.HttpServer);
  const url = HttpServer.formatAddress(server.address)
    .replace('[::]', '127.0.0.1')
    .replace('[::1]', '127.0.0.1');

  return {
    url,
    /** O job diário não tem rota HTTP; as suites o chamam por aqui. */
    runDeadlineSweep: () => runtime.runPromise(DeadlineScan.use((deadlines) => deadlines.daily())),
    drainEvents: () => runtime.runPromise(Events.use((events) => events.drain)),
    close: () => runtime.dispose(),
  };
}

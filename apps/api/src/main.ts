import './instrument.js';

import { Logger } from 'nestjs-pino';
import { createApp } from './app.js';
import { buildInfo } from './build-info.js';
import env from './config/env.js';

const app = await createApp();
app.nest
  .get(Logger)
  .log(
    `API na porta ${env.PORT} — compilada em ${buildInfo.compiledAt}, processo iniciado em ${buildInfo.startedAt}`,
  );

/* Substitui o `enableShutdownHooks()` do Nest, que fechava só o Nest: agora o socket é do
 * servidor Effect, e `close()` derruba os dois na ordem (servidor, depois crons e pool).
 * Mesma lista de sinais que o `ShutdownSignal` do Nest.
 *
 * O `process.exit` no fim NÃO é zelo: o pool do pg nunca recebe `end()` (não recebia nem
 * antes), então sempre sobra handle vivo e o node não sai sozinho. O Nest encerrava com
 * `process.kill(pid, signal)` depois dos hooks; sem um encerramento explícito aqui, um
 * SIGTERM do orquestrador fecharia o socket e penduraria o processo até o SIGKILL. */
const SHUTDOWN_SIGNALS = [
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
] as const;

for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, () => {
    void app
      .close()
      .catch((error: unknown) => {
        console.error('Falha ao encerrar a API', error);
      })
      .finally(() => process.exit(0));
  });
}

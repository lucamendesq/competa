import './instrument.js';

import { NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { AppLive } from './app.js';
import { buildInfo } from './build-info.js';
import env from './config/env.js';
import { DbPool } from './infra/database/effect.js';
import { Logger } from './lib/logger.js';

/* SIGINT/SIGTERM interrompem a fibra principal: o scope desmonta o app na ordem inversa da
 * construção (socket, crons, listeners em voo, pool) e o processo sai com 130. Sem
 * `process.exit` aqui — é o fim do pool que deixa o node livre para sair. */
AppLive({ port: env.PORT, trustProxy: env.NODE_ENV === 'production' }).pipe(
  Layer.provide(DbPool.layer),
  Layer.build,
  Effect.andThen(
    Effect.sync(() => {
      new Logger('Bootstrap').log(
        `API na porta ${env.PORT} — compilada em ${buildInfo.compiledAt}, processo iniciado em ${buildInfo.startedAt}`,
      );
    }),
  ),
  Effect.andThen(Effect.never),
  Effect.scoped,
  NodeRuntime.runMain,
);

import './instrument.js';

import { Logger } from 'nestjs-pino';
import { createApp } from './app.js';
import { buildInfo } from './build-info.js';
import env from './config/env.js';

const app = await createApp();
await app.listen(env.PORT);
app
  .get(Logger)
  .log(
    `API na porta ${env.PORT} — compilada em ${buildInfo.compiledAt}, processo iniciado em ${buildInfo.startedAt}`,
  );

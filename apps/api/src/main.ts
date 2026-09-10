import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import env, { allowedOrigins } from './config/env.js';
import { AppErrorFilter } from './lib/app-error.filter.js';
import { ResponseInterceptor } from './lib/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  /* Atrás de um reverse proxy o Express vê o IP DELE em `req.ip`, e todo @Throttle vira um
   * balde único para o mundo inteiro — um cliente barulhento 429a a base. Só em produção:
   * confiar no X-Forwarded-For sem proxy à frente deixa qualquer cliente forjar o próprio
   * IP e escapar do limite. */
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  /* A API devolve conteúdo enviado por terceiros (`GET /documents/:id/content`). O
   * `nosniff` e o CSP do helmet são a segunda barreira depois da allowlist de
   * `content_type` — HTML que escape da allowlist ainda não executa script. */
  app.use(helmet());

  app.useGlobalFilters(new AppErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({ origin: allowedOrigins, credentials: true });

  /* Dois crons e um pool de Postgres: sem isto, um SIGTERM do orquestrador derruba o
   * processo no meio de uma varredura e deixa conexão pendurada. */
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}
await bootstrap();

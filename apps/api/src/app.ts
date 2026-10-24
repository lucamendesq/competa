import { NestFactory } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Context, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import env, { allowedOrigins } from './config/env.js';
import { HealthRepository } from './health.repository.js';
import { serverLayer } from './http/server.js';
import { AppErrorFilter } from './lib/app-error.filter.js';
import { originCheck } from './lib/origin-check.js';
import { ResponseInterceptor } from './lib/response.interceptor.js';
import { DeadlineCron } from './modules/requests/deadline.cron.js';

export interface RunningApp {
  readonly url: string;
  /** Casca Nest ainda servindo as rotas não migradas; some com o estrangulamento. */
  readonly nest: NestExpressApplication;
  runDeadlineSweep(): Promise<void>;
  close(): Promise<void>;
}

async function createNestApp(trustProxy: boolean): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  /* Atrás de um reverse proxy o Express vê o IP DELE em `req.ip`, e todo @Throttle vira um
   * balde único para o mundo inteiro — um cliente barulhento 429a a base. Só em produção:
   * confiar no X-Forwarded-For sem proxy à frente deixa qualquer cliente forjar o próprio
   * IP e escapar do limite. */
  if (trustProxy) app.set('trust proxy', 1);

  /* A API devolve conteúdo enviado por terceiros (`GET /documents/:id/content`). O
   * `nosniff` e o CSP do helmet são a segunda barreira depois da allowlist de
   * `content_type` — HTML que escape da allowlist ainda não executa script. */
  app.use(helmet());
  app.use(originCheck(allowedOrigins));

  app.useGlobalFilters(new AppErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({ origin: allowedOrigins, credentials: true });

  /* `init()` e não `listen()`: quem é dono do socket é o servidor `effect/http`; o Express
   * do Nest só recebe os objetos crus da rota curinga. */
  await app.init();

  return app;
}

export async function createApp(options?: {
  readonly port?: number;
  readonly trustProxy?: boolean;
}): Promise<RunningApp> {
  const port = options?.port ?? env.PORT;
  const trustProxy = options?.trustProxy ?? env.NODE_ENV === 'production';
  const nest = await createNestApp(trustProxy);

  const health = nest.get(HealthRepository);
  const runtime = ManagedRuntime.make(
    serverLayer({
      port,
      trustProxy,
      ping: () => health.ping(),
      events: nest.get(EventEmitter2),
      fallback: nest.getHttpAdapter().getInstance(),
    }),
  );

  const server = Context.get(await runtime.context(), HttpServer.HttpServer);
  const url = HttpServer.formatAddress(server.address)
    .replace('[::]', '127.0.0.1')
    .replace('[::1]', '127.0.0.1');

  return {
    url,
    nest,
    /* O job diário não tem rota HTTP; o acoplamento ao DI mora aqui, nunca nas suites. */
    runDeadlineSweep: () => nest.get(DeadlineCron).daily(),
    /* Dois crons e um pool de Postgres: sem isto, um SIGTERM do orquestrador derruba o
     * processo no meio de uma varredura e deixa conexão pendurada. */
    close: async () => {
      await runtime.dispose();
      await nest.close();
    },
  };
}

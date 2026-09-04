import './env.js';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import env from '../src/config/env.js';
import { AppErrorFilter } from '../src/lib/app-error.filter.js';
import { ResponseInterceptor } from '../src/lib/response.interceptor.js';

/** A MESMA composição do `main.ts` — testar uma app montada diferente da real prova
 *  pouco. Escuta em `env.PORT` porque a URL pré-assinada do storage local aponta para
 *  essa porta; sem isso o PUT do teste não encontraria a rota. */
export const createTestApp = async (): Promise<INestApplication> => {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });

  app.useGlobalFilters(new AppErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({ origin: env.WEB_URL, credentials: true });

  await app.listen(env.PORT);

  return app;
};

export const http = (app: INestApplication) => request(app.getHttpServer());

/** Cookie de sessão do Better Auth como string pronta para o header. */
export const cookieHeader = (setCookie: string[] | string | undefined) => {
  if (!setCookie) return '';
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];

  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
};

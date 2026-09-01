import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import env from './config/env.js';
import { AppErrorFilter } from './lib/app-error.filter.js';
import { ResponseInterceptor } from './lib/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.useGlobalFilters(new AppErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({ origin: env.WEB_URL, credentials: true });

  await app.listen(env.PORT);
}
await bootstrap();

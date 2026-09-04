import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

/** O ThrottlerGuard de produção corta em 30 req/10s por IP, e uma suíte de integração
 *  passa disso em segundos — 429 mascarando o teste é falso vermelho, não invariante.
 *  Zerar o balde entre os testes mantém o app real (o rate limit continua montado) sem
 *  fazer a suíte competir com ele. Deveria subir para `test/app.ts`. */
export const clearRateLimit = (app: INestApplication) => {
  const storage = app.get<{ storage: Map<string, unknown> }>(ThrottlerStorage);
  storage.storage.clear();
};

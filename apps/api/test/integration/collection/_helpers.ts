import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import env from '../../../src/config/env.js';

type Record_ = {
  totalHits: Map<string, number>;
  isBlocked: boolean;
  blockExpiresAt: number;
};

/** O balde do rate limit vive no processo, não no banco: `resetDatabase()` não o zera.
 *  Sem isto um arquivo com muitos presigns (limite próprio: 20/60s) queima a cota e os
 *  vizinhos passam a receber 429 por contágio — teste dependente de ordem.
 *  Zera os contadores em vez de apagar as chaves porque o storage do @nestjs/throttler
 *  agenda um `setTimeout` por hit que ainda vai mexer no registro.
 *  HELPER QUE DEVERIA SUBIR PARA `test/app.ts`. */
export const resetThrottle = (app: INestApplication) => {
  const storage = app.get<{ storage: Map<string, Record_> }>(ThrottlerStorage);

  for (const record of storage.storage.values()) {
    for (const name of record.totalHits.keys()) record.totalHits.set(name, 0);
    record.isBlocked = false;
    record.blockExpiresAt = 0;
  }
};

/** Cada arquivo de integração precisa da SUA porta: os arquivos rodam em forks
 *  sequenciais e o fork anterior ainda pode estar segurando o socket quando o próximo
 *  chama `createTestApp()` — o segundo arquivo morre com EADDRINUSE antes do primeiro
 *  teste. `env.PORT` é lido pelo `app.listen()` e pela URL pré-assinada do storage local,
 *  então trocar a porta ANTES de subir a app mantém o PUT do teste apontando para o lugar
 *  certo. DEVERIA SUBIR PARA `test/app.ts` (createTestApp escolhendo porta livre). */
export const useOwnPort = (port: number) => {
  env.PORT = port;
};

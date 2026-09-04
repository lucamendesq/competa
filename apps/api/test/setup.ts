import './env.js';

import { execSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { beforeAll } from 'vitest';

/** Uma migração por processo de teste: as mesmas migrations de produção, de banco vazio.
 *  Se elas quebrarem, a suíte inteira falha aqui — que é o lugar certo para descobrir. */
beforeAll(() => {
  execSync('npx drizzle-kit migrate', {
    stdio: 'pipe',
    env: { ...process.env, DB_NAME: process.env.DB_NAME },
  });
});

/** O storage de teste não pode herdar arquivo de rodada anterior. */
beforeAll(async () => {
  await rm(process.env.STORAGE_LOCAL_DIR!, { recursive: true, force: true });
});

import { assertTestDatabase } from './test-database.js';
import { rm } from 'node:fs/promises';

/** O storage local do teste nasce vazio a cada run — senão a varredura de órfãos do cron de
 *  prazos roda contra arquivos de execuções anteriores. */
export async function setup() {
  assertTestDatabase(process.env.DB_NAME ?? 'competa_test');
  await rm('.storage-test', { recursive: true, force: true });
}

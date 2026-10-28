import { rm } from 'node:fs/promises';

/** O storage local do teste nasce vazio a cada run — senão a varredura de órfãos do cron de
 *  prazos roda contra arquivos de execuções anteriores. */
export async function setup() {
  await rm('.storage-test', { recursive: true, force: true });
}

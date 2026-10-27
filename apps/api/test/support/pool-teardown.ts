import { afterAll } from 'vitest';
import { pool } from '../../src/infra/database/index.js';

/* Cada arquivo de spec reimporta os módulos e ganha um pool próprio; sem fechá-lo, o worker
 * reaproveitado acumula um pool de 25 conexões por arquivo. Roda depois dos `afterAll` do
 * spec, que ainda consultam. */
afterAll(async () => {
  if (!pool.ended) await pool.end();
});

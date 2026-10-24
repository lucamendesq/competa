import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { run } from './effect/runtime.js';
import { Db } from './infra/database/effect.js';

/** Consulta de uma linha só: "o pool responde?". Sem escopo porque não há dado — a regra
 *  de exigir `FirmScope` na assinatura vale para consulta de negócio. */
export const ping = async (): Promise<void> => {
  await run(Effect.flatMap(Db, (db) => db.use((d) => d.execute(sql`select 1`))));
};

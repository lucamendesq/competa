import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { Db } from './infra/database/effect.js';

/** Consulta de uma linha só: "o pool responde?". Sem escopo porque não há dado — a regra
 *  de exigir `FirmScope` na assinatura vale para consulta de negócio. */
export const ping = Effect.flatMap(Db, (db) => db.use((d) => d.execute(sql`select 1`)));

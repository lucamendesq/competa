import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { timestamps } from './columns.js';

/** Voo único das varreduras agendadas, substituindo o `pg_advisory_lock`. O advisory lock é
 *  de SESSÃO, e `db.use` tira um checkout novo do pool a cada `execute`: o unlock caía numa
 *  conexão diferente da do lock e o lock vazava — como o pool tem `min: 5`, a conexão nunca
 *  era reciclada e TODA varredura seguinte era pulada em silêncio, para sempre.
 *
 *  A lease não depende de sessão: tomar e soltar são um `UPDATE` cada, e um vazamento morre
 *  sozinho quando `expires_at` passa. Também dá para auditar com um `SELECT`. */
export const cronLease = pgTable('cron_lease', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
}).enableRLS();

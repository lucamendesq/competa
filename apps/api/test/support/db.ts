import { sql } from 'drizzle-orm';
import { db, pool } from '../../src/infra/database/index.js';

export { db, pool };

export async function truncateAll() {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'`,
  );
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names.length === 0) return;
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}

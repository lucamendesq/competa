import { sql } from 'drizzle-orm';
import { db, pool } from '../../src/infra/database/index.js';
import seedCatalog from '../../src/infra/database/seeds/001-document-types-and-templates.js';

export { db, pool };

/** CASCADE leva junto o catálogo (document_type referencia accounting_firm), então o seed
 *  roda de novo — como num banco recém-migrado. */
export async function truncateAll() {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names.length === 0) return;
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
  await seedCatalog();
}

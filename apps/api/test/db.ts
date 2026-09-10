import './env.js';

import { sql } from 'drizzle-orm';
import { db } from '../src/infra/database/index.js';
import seedDocumentTypes from '../src/infra/database/seeds/001-document-types-and-templates.js';

/** Tabelas na ordem em que podem ser truncadas (CASCADE resolve o resto). `document_type`
 *  e `checklist_template` do produto são recriados pelo seed. */
export const resetDatabase = async () => {
  /* Trava de segurança: `truncate cascade` apaga tudo. Se `DB_NAME` vazar do `.env` (o
   * banco de desenvolvimento), a suíte destruiria os dados locais em silêncio — já
   * aconteceu. Melhor falhar alto do que limpar o banco errado. */
  const dbName = process.env.DB_NAME;
  const expected = process.env.TEST_DB_NAME ?? 'competa_test';

  if (dbName !== expected) {
    throw new Error(
      `resetDatabase abortado: DB_NAME é "${dbName}", esperado "${expected}". ` +
        'A suíte só limpa o banco de teste.',
    );
  }

  await db.execute(sql`
    truncate table
      message, upload_link, document, request_item, request, period,
      company_checklist_override, contact, company, invite, accountant, accounting_firm,
      checklist_template_item, checklist_template, document_type,
      "session", account, verification, "user"
    restart identity cascade
  `);

  await seedDocumentTypes();
};

export { db };

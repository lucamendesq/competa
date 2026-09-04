import './env.js';

import { sql } from 'drizzle-orm';
import { db } from '../src/infra/database/index.js';
import seedDocumentTypes from '../src/infra/database/seeds/001-document-types-and-templates.js';

/** Tabelas na ordem em que podem ser truncadas (CASCADE resolve o resto). `document_type`
 *  e `checklist_template` do produto são recriados pelo seed. */
export const resetDatabase = async () => {
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

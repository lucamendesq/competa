import { parseArgs } from 'node:util';
import { addDays } from 'date-fns';
import { db } from '../infra/database/index.js';
import { accountingFirm, invite } from '../infra/database/schema/index.js';
import { createToken } from '../lib/token.js';
import env from '../config/env.js';

const { values } = parseArgs({
  options: { name: { type: 'string' }, email: { type: 'string' } },
});

if (!values.name || !values.email) {
  console.error('uso: create-firm --name "Contabilidade X" --email contador@x.com.br');
  process.exit(1);
}

const { token, tokenHash } = createToken();

await db.transaction(async (tx) => {
  const [firm] = await tx.insert(accountingFirm).values({ name: values.name! }).returning();

  await tx.insert(invite).values({
    tokenHash,
    email: values.email!,
    accountingFirmId: firm.id,
    expiresAt: addDays(new Date(), env.INVITE_TTL_DAYS),
  });

  console.log(`\nContabilidade criada: ${firm.name} (${firm.id})`);
  console.log(`Link de convite (válido por ${env.INVITE_TTL_DAYS} dias):`);
  console.log(`${env.WEB_URL}/convite/${token}\n`);
});

process.exit(0);

import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import {
  period,
  request,
  requestItem,
  uploadLink,
} from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  createCompany,
  insertCompany,
  insertContact,
  openPeriod,
} from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** Fan-out da abertura: quem recebe Solicitação, quem vira aviso e o que é atômico. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3972);
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
});

test('cada Empresa ativa com Responsável recebe UMA Solicitação com UM Link', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await createCompany(app, session.cookie, { name: 'Mercado do Bairro' });

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(opened.requests.map((row) => row.companyName)).toEqual([
    'Mercado do Bairro',
    'Padaria Central',
  ]);
  expect(await db.select().from(request)).toHaveLength(2);
  expect(await db.select().from(uploadLink)).toHaveLength(2);
});

test('Empresa inativa não gera Solicitação e NÃO aparece em warnings', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const inactive = await insertCompany(session.firm.id, { name: 'Loja Fechada', active: false });
  await insertContact(inactive.id);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(opened.requests.map((row) => row.companyName)).toEqual(['Padaria Central']);
  expect(opened.warnings).toEqual([]);
});

test('Empresa ativa sem Responsável não gera Solicitação e vira aviso ao Contador', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await insertCompany(session.firm.id, { name: 'Sem Responsável' });

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(opened.requests.map((row) => row.companyName)).toEqual(['Padaria Central']);
  expect(opened.warnings.map((row) => row.companyName)).toEqual(['Sem Responsável']);
  expect(await db.select().from(request)).toHaveLength(1);
});

test('Empresa com dois Responsáveis gera 1 Solicitação e o Link fica com o mais antigo', async () => {
  const session = await createAccountantSession(app);
  const company = await insertCompany(session.firm.id, { name: 'Padaria Central' });
  const older = await insertContact(company.id, {
    name: 'Responsável Antigo',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  const newer = await insertContact(company.id, {
    name: 'Responsável Novo',
    createdAt: new Date('2026-06-01T00:00:00Z'),
  });

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(opened.requests).toHaveLength(1);
  const links = await db.select().from(uploadLink);
  expect(links).toHaveLength(1);
  expect(links[0].contactId).toBe(older.id);
  expect(links[0].contactId).not.toBe(newer.id);
});

test('Empresa de outra Contabilidade nunca entra no fan-out', async () => {
  const mine = await createAccountantSession(app);
  const other = await createAccountantSession(app);
  await createCompany(app, mine.cookie, { name: 'Minha Empresa' });
  await createCompany(app, other.cookie, { name: 'Empresa Alheia' });

  const opened = await openPeriod(app, mine.cookie, { referenceMonth: '2026-07' });

  expect(opened.requests.map((row) => row.companyName)).toEqual(['Minha Empresa']);
  expect(opened.warnings).toEqual([]);
});

test('falha no meio do fan-out desfaz a abertura inteira (uma transação)', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await createCompany(app, session.cookie, { name: 'Mercado do Bairro' });

  // O Link é o ÚLTIMO insert da transação: falhar aqui só prova rollback se Solicitação e
  // Itens, já gravados, também desaparecerem.
  await db.execute(sql`
    create or replace function teste_falha_upload_link() returns trigger
    language plpgsql as $$ begin raise exception 'falha proposital no Link'; end $$
  `);
  await db.execute(sql`
    create trigger teste_falha_upload_link before insert on upload_link
    for each row execute function teste_falha_upload_link()
  `);

  try {
    await http(app)
      .post('/periods')
      .set('cookie', session.cookie)
      .send({ referenceMonth: '2026-07' })
      .expect(500);
  } finally {
    await db.execute(sql`drop trigger teste_falha_upload_link on upload_link`);
    await db.execute(sql`drop function teste_falha_upload_link()`);
  }

  expect(await db.select().from(period)).toHaveLength(0);
  expect(await db.select().from(request)).toHaveLength(0);
  expect(await db.select().from(requestItem)).toHaveLength(0);
  expect(await db.select().from(uploadLink)).toHaveLength(0);
});

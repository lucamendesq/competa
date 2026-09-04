import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { requestItem } from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  insertCompany,
  insertContact,
  openPeriod,
  productTemplate,
} from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** Prazo do Item é congelado na abertura: reference_month + due_month_offset, no due_day. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3974);
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
});

const company = async (firmId: string, flags: Record<string, boolean> = {}, templateId?: string) => {
  const row = await insertCompany(firmId, {
    name: 'Padaria Central',
    flags,
    ...(templateId ? { checklistTemplateId: templateId } : {}),
  });
  await insertContact(row.id);

  return row;
};

const dueByName = async (requestId: string) => {
  const rows = await db
    .select({ name: requestItem.name, dueDate: requestItem.dueDate })
    .from(requestItem)
    .where(eq(requestItem.requestId, requestId));

  return new Map(rows.map((row) => [row.name, row.dueDate]));
};

/** Template próprio com um item de prazo sob controle do teste. */
const templateWithDueDay = async (
  cookie: string,
  documentTypeId: string,
  scheduling: { dueDay: number; dueMonthOffset: number },
) => {
  const product = await productTemplate();
  const derived = await http(app)
    .post(`/checklist-templates/${product.id}/derive`)
    .set('cookie', cookie)
    .send({ name: 'Template da Casa' })
    .expect(201);
  const templateId = derived.body.data.id as string;

  const items = await http(app)
    .get(`/checklist-templates/${templateId}`)
    .set('cookie', cookie)
    .expect(200);
  const target = (items.body.data.items as { id: string; documentTypeId: string }[]).find(
    (item) => item.documentTypeId === documentTypeId,
  )!;

  await http(app)
    .patch(`/checklist-templates/${templateId}/items/${target.id}`)
    .set('cookie', cookie)
    .send(scheduling)
    .expect(200);

  return templateId;
};

test('due_month_offset 0 vence no PRÓPRIO mês de referência', async () => {
  const session = await createAccountantSession(app);
  await company(session.firm.id, { has_employees: true });

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const due = await dueByName(opened.requests[0].id);

  // variáveis da folha: due_day 25, due_month_offset 0
  expect(due.get(CATALOG.variaveis_folha.name)).toBe('2026-07-25');
});

test('due_month_offset 1 vence no mês SEGUINTE ao de referência', async () => {
  const session = await createAccountantSession(app);
  await company(session.firm.id);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const due = await dueByName(opened.requests[0].id);

  expect(due.get(CATALOG.nf_emitidas.name)).toBe('2026-08-05');
  expect(due.get(CATALOG.das_pago.name)).toBe('2026-08-25');
});

test('due_day além do fim do mês clampa para o último dia (31 em fevereiro)', async () => {
  const session = await createAccountantSession(app);
  const templateId = await templateWithDueDay(session.cookie, CATALOG.nf_emitidas.id, {
    dueDay: 31,
    dueMonthOffset: 1,
  });
  await company(session.firm.id, {}, templateId);

  const comum = await openPeriod(app, session.cookie, { referenceMonth: '2026-01' });
  expect((await dueByName(comum.requests[0].id)).get(CATALOG.nf_emitidas.name)).toBe('2026-02-28');

  const bissexto = await openPeriod(app, session.cookie, { referenceMonth: '2024-01' });
  expect((await dueByName(bissexto.requests[0].id)).get(CATALOG.nf_emitidas.name)).toBe(
    '2024-02-29',
  );

  const abril = await openPeriod(app, session.cookie, { referenceMonth: '2026-04' });
  expect((await dueByName(abril.requests[0].id)).get(CATALOG.nf_emitidas.name)).toBe('2026-05-31');
});

test('o prazo congelado atravessa a virada do ano', async () => {
  const session = await createAccountantSession(app);
  await company(session.firm.id);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-12' });
  const due = await dueByName(opened.requests[0].id);

  expect(due.get(CATALOG.nf_emitidas.name)).toBe('2027-01-05');
  expect(due.get(CATALOG.das_pago.name)).toBe('2027-01-25');
});

test('Item sem due_day fica com prazo nulo e herda o prazo da Competência', async () => {
  const session = await createAccountantSession(app);
  await company(session.firm.id);

  const opened = await openPeriod(app, session.cookie, {
    referenceMonth: '2026-07',
    dueDate: '2026-08-31',
  });
  const due = await dueByName(opened.requests[0].id);
  expect(due.get(CATALOG.livro_caixa.name)).toBeNull();

  const token = opened.tokenFor('Padaria Central');
  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const item = (checklist.body.data.items as { name: string; dueDate: string | null }[]).find(
    (row) => row.name === CATALOG.livro_caixa.name,
  )!;

  expect(item.dueDate).toBe('2026-08-31');
});

test('sem prazo no Item e sem prazo na Competência o Item fica sem prazo', async () => {
  const session = await createAccountantSession(app);
  await company(session.firm.id);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const token = opened.tokenFor('Padaria Central');

  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const item = (checklist.body.data.items as { name: string; dueDate: string | null }[]).find(
    (row) => row.name === CATALOG.livro_caixa.name,
  )!;

  expect(item.dueDate).toBeNull();
});

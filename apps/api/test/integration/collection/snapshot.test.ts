import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { requestItem } from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  createCompany,
  insertCompany,
  insertContact,
  openPeriod,
  productTemplate,
} from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** A invariante do core: o checklist da Solicitação é um SNAPSHOT congelado na abertura. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3973);
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
});

/** Template próprio da Contabilidade (o do produto é imutável) + Empresa que o usa. */
const companyWithOwnTemplate = async (
  cookie: string,
  firmId: string,
  flags: Record<string, boolean> = {},
) => {
  const product = await productTemplate();
  const derived = await http(app)
    .post(`/checklist-templates/${product.id}/derive`)
    .set('cookie', cookie)
    .send({ name: 'Template da Casa' })
    .expect(201);
  const templateId = derived.body.data.id as string;

  const company = await insertCompany(firmId, {
    name: 'Padaria Central',
    checklistTemplateId: templateId,
    flags,
  });
  await insertContact(company.id);

  return { templateId, company };
};

const itemsOf = async (cookie: string, requestId: string) => {
  const response = await http(app).get(`/requests/${requestId}`).set('cookie', cookie).expect(200);

  return response.body.data.items as {
    id: string;
    name: string;
    description: string | null;
    acceptedFormats: string[];
    dueDate: string | null;
  }[];
};

test('o Item copia name, description e accepted_formats do checklist efetivo', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  const items = await itemsOf(session.cookie, opened.requests[0].id);
  const statement = items.find((item) => item.name === CATALOG.extrato_bancario.name)!;

  expect(statement.description).toBe(CATALOG.extrato_bancario.description);
  expect(statement.acceptedFormats).toEqual([...CATALOG.extrato_bancario.acceptedFormats]);

  const [row] = await db.select().from(requestItem).where(eq(requestItem.id, statement.id));
  expect(row.documentTypeId).toBe(CATALOG.extrato_bancario.id);
});

test('item on_demand NUNCA entra no fan-out', async () => {
  const session = await createAccountantSession(app);
  const { templateId } = await companyWithOwnTemplate(session.cookie, session.firm.id);

  await http(app)
    .post(`/checklist-templates/${templateId}/items`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: CATALOG.documentos_admissao.id, periodicity: 'on_demand' })
    .expect(201);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const items = await itemsOf(session.cookie, opened.requests[0].id);

  expect(items.map((item) => item.name)).not.toContain(CATALOG.documentos_admissao.name);
});

test('item annual entra só na competência do annual_month (dezembro sim, agosto não)', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const annual = CATALOG.relatorio_anual_receitas_mei.name;

  const august = await openPeriod(app, session.cookie, { referenceMonth: '2026-08' });
  expect((await itemsOf(session.cookie, august.requests[0].id)).map((i) => i.name)).not.toContain(
    annual,
  );

  const dezembro = await openPeriod(app, session.cookie, { referenceMonth: '2026-12' });
  expect((await itemsOf(session.cookie, dezembro.requests[0].id)).map((i) => i.name)).toContain(
    annual,
  );
});

test('condition_flag filtra o snapshot pelas flags da Empresa', async () => {
  const session = await createAccountantSession(app);
  const withoutPayroll = await insertCompany(session.firm.id, { name: 'Sem Empregados' });
  await insertContact(withoutPayroll.id);
  const withPayroll = await insertCompany(session.firm.id, {
    name: 'Com Empregados',
    flags: { has_employees: true },
  });
  await insertContact(withPayroll.id);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const byName = new Map(opened.requests.map((row) => [row.companyName, row.id]));

  const folha = CATALOG.variaveis_folha.name;
  expect(
    (await itemsOf(session.cookie, byName.get('Sem Empregados')!)).map((i) => i.name),
  ).not.toContain(folha);
  expect(
    (await itemsOf(session.cookie, byName.get('Com Empregados')!)).map((i) => i.name),
  ).toContain(folha);
});

test('alterar o template DEPOIS de abrir não muda a Solicitação já aberta', async () => {
  const session = await createAccountantSession(app);
  const { templateId } = await companyWithOwnTemplate(session.cookie, session.firm.id);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const requestId = opened.requests[0].id;
  const before = await itemsOf(session.cookie, requestId);

  const template = await http(app)
    .get(`/checklist-templates/${templateId}`)
    .set('cookie', session.cookie)
    .expect(200);
  const templateItems = template.body.data.items as { id: string; name: string }[];
  const statement = templateItems.find((item) => item.name === CATALOG.extrato_bancario.name)!;

  // remove um item, muda o prazo de outro e adiciona um terceiro — nada disso pode vazar
  // para a Solicitação aberta.
  await http(app)
    .delete(`/checklist-templates/${templateId}/items/${statement.id}`)
    .set('cookie', session.cookie)
    .expect(204);
  await http(app)
    .post(`/checklist-templates/${templateId}/items`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: CATALOG.aluguel.id, dueDay: 10, dueMonthOffset: 1 })
    .expect(201);
  const dasPaid = templateItems.find((item) => item.name === CATALOG.das_pago.name)!;
  await http(app)
    .patch(`/checklist-templates/${templateId}/items/${dasPaid.id}`)
    .set('cookie', session.cookie)
    .send({ dueDay: 1, dueMonthOffset: 0 })
    .expect(200);

  expect(await itemsOf(session.cookie, requestId)).toEqual(before);
});

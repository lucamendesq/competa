import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import {
  checklistTemplate,
  checklistTemplateItem,
  documentType,
} from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createFirm, productTemplate } from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** Template de Checklist: o do produto é imutável, a Contabilidade deriva o seu. */

let app: INestApplication;
const GHOST = '01a06884-0000-7000-8000-0000000000ff';

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  clearRateLimit(app);
});

/** Contabilidade com um template derivado (o único editável). */
const withDerived = async () => {
  const session = await createAccountantSession(app);
  const produto = await productTemplate();
  const derived = await http(app)
    .post(`/checklist-templates/${produto.id}/derive`)
    .set('cookie', session.cookie)
    .send({ name: 'Meu MEI' })
    .expect(201);

  return { session, produto, derived: derived.body.data as { id: string; itemCount: number } };
};

test('listagem mostra os 5 templates do produto marcados como isProduct e com contagem de itens', async () => {
  const session = await createAccountantSession(app);

  const response = await http(app)
    .get('/checklist-templates')
    .set('cookie', session.cookie)
    .expect(200);

  expect(response.body.data).toHaveLength(5);
  expect(response.body.data.every((t: { isProduct: boolean }) => t.isProduct)).toBe(true);
  expect(response.body.data.every((t: { itemCount: number }) => t.itemCount > 0)).toBe(true);
});

test('template do produto devolve os itens com os dados do catálogo', async () => {
  const session = await createAccountantSession(app);
  const produto = await productTemplate();

  const response = await http(app)
    .get(`/checklist-templates/${produto.id}`)
    .set('cookie', session.cookie)
    .expect(200);

  const statement = response.body.data.items.find(
    (i: { documentTypeId: string }) => i.documentTypeId === CATALOG.extrato_bancario.id,
  );
  expect(statement).toMatchObject({
    name: CATALOG.extrato_bancario.name,
    acceptedFormats: CATALOG.extrato_bancario.acceptedFormats,
    periodicity: 'monthly',
    required: true,
  });
});

test('template do produto é imutável: adicionar, editar e remover item respondem 409', async () => {
  const session = await createAccountantSession(app);
  const produto = await productTemplate();
  const [item] = await db
    .select()
    .from(checklistTemplateItem)
    .where(eq(checklistTemplateItem.checklistTemplateId, produto.id))
    .limit(1);

  const add = await http(app)
    .post(`/checklist-templates/${produto.id}/items`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: CATALOG.guia_iss.id })
    .expect(409);
  expect(add.body.error.code).toBe('TEMPLATE_IMMUTABLE');

  await http(app)
    .patch(`/checklist-templates/${produto.id}/items/${item.id}`)
    .set('cookie', session.cookie)
    .send({ required: false })
    .expect(409);

  await http(app)
    .delete(`/checklist-templates/${produto.id}/items/${item.id}`)
    .set('cookie', session.cookie)
    .expect(409);

  const [intacto] = await db
    .select()
    .from(checklistTemplateItem)
    .where(eq(checklistTemplateItem.id, item.id));
  expect(intacto.required).toBe(true);
});

test('derivar cria cópia da Contabilidade com derivedFrom e TODOS os itens da origem', async () => {
  const { session, produto, derived } = await withDerived();

  const [row] = await db
    .select()
    .from(checklistTemplate)
    .where(eq(checklistTemplate.id, derived.id));
  expect(row.accountingFirmId).toBe(session.firm.id);
  expect(row.derivedFrom).toBe(produto.id);

  const origem = await http(app)
    .get(`/checklist-templates/${produto.id}`)
    .set('cookie', session.cookie)
    .expect(200);
  const copia = await http(app)
    .get(`/checklist-templates/${derived.id}`)
    .set('cookie', session.cookie)
    .expect(200);

  expect(derived.itemCount).toBe(origem.body.data.items.length);
  expect(copia.body.data.items.map((i: { documentTypeId: string }) => i.documentTypeId)).toEqual(
    origem.body.data.items.map((i: { documentTypeId: string }) => i.documentTypeId),
  );
  expect(copia.body.data.name).toBe('Meu MEI');
});

test('derivar sem nome herda o nome da origem', async () => {
  const session = await createAccountantSession(app);
  const produto = await productTemplate();

  const response = await http(app)
    .post(`/checklist-templates/${produto.id}/derive`)
    .set('cookie', session.cookie)
    .send({})
    .expect(201);

  expect(response.body.data.name).toBe(produto.name);
});

test('derivar template que já é da Contabilidade responde 409 — edite-o direto', async () => {
  const { session, derived } = await withDerived();

  const response = await http(app)
    .post(`/checklist-templates/${derived.id}/derive`)
    .set('cookie', session.cookie)
    .send({ name: 'Cópia da cópia' })
    .expect(409);

  expect(response.body.error.code).toBe('TEMPLATE_ALREADY_OWNED');
});

test('item anual sem annualMonth é recusado com 422; com o mês entra', async () => {
  const { session, derived } = await withDerived();

  const rejection = await http(app)
    .post(`/checklist-templates/${derived.id}/items`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: CATALOG.guia_iss.id, periodicity: 'annual' })
    .expect(422);
  expect(JSON.stringify(rejection.body.error.details)).toMatch(/annualMonth/);

  await http(app)
    .post(`/checklist-templates/${derived.id}/items`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: CATALOG.guia_iss.id, periodicity: 'annual', annualMonth: 12 })
    .expect(201);
});

test('item com Tipo de Documento de outra Contabilidade é recusado com 422', async () => {
  const { session, derived } = await withDerived();
  const other = await createFirm('Vizinha');
  const [foreign] = await db
    .insert(documentType)
    .values({ accountingFirmId: other.id, name: 'Doc da vizinha', category: 'fiscal' })
    .returning();

  const response = await http(app)
    .post(`/checklist-templates/${derived.id}/items`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: foreign.id })
    .expect(422);

  expect(response.body.error.code).toBe('DOCUMENT_TYPE_NOT_VISIBLE');
});

test('item do template derivado é editável e removível, e o inexistente responde 404', async () => {
  const { session, derived } = await withDerived();
  const created = await http(app)
    .post(`/checklist-templates/${derived.id}/items`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: CATALOG.guia_iss.id, dueDay: 10 })
    .expect(201);

  const editado = await http(app)
    .patch(`/checklist-templates/${derived.id}/items/${created.body.data.id}`)
    .set('cookie', session.cookie)
    .send({ required: false, dueDay: 20 })
    .expect(200);
  expect(editado.body.data).toMatchObject({ required: false, dueDay: 20 });

  await http(app)
    .delete(`/checklist-templates/${derived.id}/items/${created.body.data.id}`)
    .set('cookie', session.cookie)
    .expect(204);

  await http(app)
    .patch(`/checklist-templates/${derived.id}/items/${GHOST}`)
    .set('cookie', session.cookie)
    .send({ required: false })
    .expect(404);
  await http(app)
    .delete(`/checklist-templates/${derived.id}/items/${GHOST}`)
    .set('cookie', session.cookie)
    .expect(404);
});

test('template inexistente responde 404 na leitura e na derivação', async () => {
  const session = await createAccountantSession(app);

  await http(app).get(`/checklist-templates/${GHOST}`).set('cookie', session.cookie).expect(404);
  await http(app)
    .post(`/checklist-templates/${GHOST}/derive`)
    .set('cookie', session.cookie)
    .send({})
    .expect(404);
});

test('adicionar duas vezes o mesmo Tipo de Documento no template responde 409, não 500', async () => {
  const { session, derived } = await withDerived();
  const body = { documentTypeId: CATALOG.guia_iss.id };

  await http(app)
    .post(`/checklist-templates/${derived.id}/items`)
    .set('cookie', session.cookie)
    .send(body)
    .expect(201);

  const repeated = await http(app)
    .post(`/checklist-templates/${derived.id}/items`)
    .set('cookie', session.cookie)
    .send(body);

  expect(repeated.status).toBe(409);
  expect(repeated.body.error.code).toBe('TEMPLATE_ITEM_DUPLICATED');
});

import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { documentType } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  createCompany,
  insertCompany,
  insertContact,
  productTemplate,
} from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** A invariante mais dura do registry (sigilo profissional, NBC PG 01): a Contabilidade B
 *  não pode nem saber que o recurso da A existe — 404, nunca 403 nem 200. */

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

const twoFirms = async () => {
  const a = await createAccountantSession(app, { firmName: 'Contabilidade A' });
  const company = await createCompany(app, a.cookie, { name: 'Empresa da A' });
  const contato = await insertContact(company.id);
  const b = await createAccountantSession(app, { firmName: 'Contabilidade B' });
  clearRateLimit(app);

  return { a, b, company, contato };
};

test('B recebe 404 em toda leitura de recurso da A — nunca 403 nem 200', async () => {
  const { b, company } = await twoFirms();
  const rotas = [
    `/companies/${company.id}`,
    `/companies/${company.id}/contacts`,
    `/companies/${company.id}/checklist`,
    `/companies/${company.id}/checklist-overrides`,
  ];

  for (const rota of rotas) {
    const response = await http(app).get(rota).set('cookie', b.cookie);
    expect({ rota, status: response.status }).toEqual({ rota, status: 404 });
  }
});

test('B recebe 404 em toda escrita em recurso da A — a Empresa da A não muda', async () => {
  const { a, b, company, contato } = await twoFirms();

  await http(app)
    .patch(`/companies/${company.id}`)
    .set('cookie', b.cookie)
    .send({ name: 'Sequestrada' })
    .expect(404);
  await http(app).delete(`/companies/${company.id}`).set('cookie', b.cookie).expect(404);
  await http(app)
    .post(`/companies/${company.id}/contacts`)
    .set('cookie', b.cookie)
    .send({ name: 'Intruso', email: 'intruso@b.com' })
    .expect(404);
  await http(app)
    .patch(`/companies/${company.id}/contacts/${contato.id}`)
    .set('cookie', b.cookie)
    .send({ name: 'Intruso' })
    .expect(404);
  await http(app)
    .delete(`/companies/${company.id}/contacts/${contato.id}`)
    .set('cookie', b.cookie)
    .expect(404);
  await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', b.cookie)
    .send({ documentTypeId: CATALOG.guia_iss.id, action: 'remove' })
    .expect(404);
  await http(app)
    .delete(`/companies/${company.id}/checklist-overrides/${CATALOG.guia_iss.id}`)
    .set('cookie', b.cookie)
    .expect(404);

  clearRateLimit(app);
  const after = await http(app).get(`/companies/${company.id}`).set('cookie', a.cookie).expect(200);
  expect(after.body.data.name).toBe('Empresa da A');
  expect(after.body.data.active).toBe(true);
  expect(after.body.data.contacts).toHaveLength(2);
});

test('template derivado pela A é invisível para a B — 404 na leitura e em toda edição', async () => {
  const { a, b } = await twoFirms();
  const produto = await productTemplate();
  const derived = await http(app)
    .post(`/checklist-templates/${produto.id}/derive`)
    .set('cookie', a.cookie)
    .send({ name: 'Template só da A' })
    .expect(201);
  const id = derived.body.data.id as string;
  clearRateLimit(app);

  await http(app).get(`/checklist-templates/${id}`).set('cookie', b.cookie).expect(404);
  await http(app)
    .post(`/checklist-templates/${id}/derive`)
    .set('cookie', b.cookie)
    .send({})
    .expect(404);
  await http(app)
    .post(`/checklist-templates/${id}/items`)
    .set('cookie', b.cookie)
    .send({ documentTypeId: CATALOG.guia_iss.id })
    .expect(404);
  await http(app)
    .patch(`/checklist-templates/${id}/items/${GHOST}`)
    .set('cookie', b.cookie)
    .send({ required: false })
    .expect(404);
  await http(app)
    .delete(`/checklist-templates/${id}/items/${GHOST}`)
    .set('cookie', b.cookie)
    .expect(404);

  const listOfB = await http(app).get('/checklist-templates').set('cookie', b.cookie).expect(200);
  expect(listOfB.body.data.map((t: { name: string }) => t.name)).not.toContain('Template só da A');
});

test('listagem de Empresas não vaza linha nem total de outro tenant', async () => {
  const { a, b } = await twoFirms();
  await insertCompany(b.firm.id, { name: 'Empresa da B 1' });
  await insertCompany(b.firm.id, { name: 'Empresa da B 2' });

  const ofA = await http(app).get('/companies').set('cookie', a.cookie).expect(200);
  expect(ofA.body.data.map((r: { name: string }) => r.name)).toEqual(['Empresa da A']);
  expect(ofA.body.meta.total).toBe(1);

  const ofB = await http(app).get('/companies').set('cookie', b.cookie).expect(200);
  expect(ofB.body.meta.total).toBe(2);
});

test('Tipo de Documento próprio da A não aparece no catálogo da B nem serve para a B', async () => {
  const { a, b, company } = await twoFirms();
  const [proprio] = await db
    .insert(documentType)
    .values({
      accountingFirmId: a.firm.id,
      name: 'Planilha interna da A',
      category: 'corporate',
      acceptedFormats: ['xlsx'],
    })
    .returning();

  const catalogOfB = await http(app)
    .get('/document-types?perPage=100')
    .set('cookie', b.cookie)
    .expect(200);
  expect(catalogOfB.body.data.map((r: { id: string }) => r.id)).not.toContain(proprio.id);

  const companyOfB = await insertCompany(b.firm.id, { name: 'Empresa da B' });
  const rejection = await http(app)
    .put(`/companies/${companyOfB.id}/checklist-overrides`)
    .set('cookie', b.cookie)
    .send({ documentTypeId: proprio.id, action: 'add' })
    .expect(422);
  expect(rejection.body.error.code).toBe('DOCUMENT_TYPE_NOT_VISIBLE');

  const catalogOfA = await http(app)
    .get('/document-types?perPage=100')
    .set('cookie', a.cookie)
    .expect(200);
  expect(catalogOfA.body.data.map((r: { id: string }) => r.id)).toContain(proprio.id);
  expect(company.id).toBeDefined();
});

test('sem sessão nenhuma rota do Cadastro responde — 401, não 404', async () => {
  await resetDatabase();

  await http(app).get('/companies').expect(401);
  await http(app).get('/document-types').expect(401);
  await http(app).get('/checklist-templates').expect(401);
  await http(app).post('/companies').send({ name: 'X' }).expect(401);
});

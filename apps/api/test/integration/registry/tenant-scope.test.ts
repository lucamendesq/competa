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
const FANTASMA = '01a06884-0000-7000-8000-0000000000ff';

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

const duasContabilidades = async () => {
  const a = await createAccountantSession(app, { firmName: 'Contabilidade A' });
  const empresa = await createCompany(app, a.cookie, { name: 'Empresa da A' });
  const contato = await insertContact(empresa.id);
  const b = await createAccountantSession(app, { firmName: 'Contabilidade B' });
  clearRateLimit(app);

  return { a, b, empresa, contato };
};

test('B recebe 404 em toda leitura de recurso da A — nunca 403 nem 200', async () => {
  const { b, empresa } = await duasContabilidades();
  const rotas = [
    `/companies/${empresa.id}`,
    `/companies/${empresa.id}/contacts`,
    `/companies/${empresa.id}/checklist`,
    `/companies/${empresa.id}/checklist-overrides`,
  ];

  for (const rota of rotas) {
    const response = await http(app).get(rota).set('cookie', b.cookie);
    expect({ rota, status: response.status }).toEqual({ rota, status: 404 });
  }
});

test('B recebe 404 em toda escrita em recurso da A — a Empresa da A não muda', async () => {
  const { a, b, empresa, contato } = await duasContabilidades();

  await http(app)
    .patch(`/companies/${empresa.id}`)
    .set('cookie', b.cookie)
    .send({ name: 'Sequestrada' })
    .expect(404);
  await http(app).delete(`/companies/${empresa.id}`).set('cookie', b.cookie).expect(404);
  await http(app)
    .post(`/companies/${empresa.id}/contacts`)
    .set('cookie', b.cookie)
    .send({ name: 'Intruso', email: 'intruso@b.com' })
    .expect(404);
  await http(app)
    .patch(`/companies/${empresa.id}/contacts/${contato.id}`)
    .set('cookie', b.cookie)
    .send({ name: 'Intruso' })
    .expect(404);
  await http(app)
    .delete(`/companies/${empresa.id}/contacts/${contato.id}`)
    .set('cookie', b.cookie)
    .expect(404);
  await http(app)
    .put(`/companies/${empresa.id}/checklist-overrides`)
    .set('cookie', b.cookie)
    .send({ documentTypeId: CATALOG.guia_iss.id, action: 'remove' })
    .expect(404);
  await http(app)
    .delete(`/companies/${empresa.id}/checklist-overrides/${CATALOG.guia_iss.id}`)
    .set('cookie', b.cookie)
    .expect(404);

  clearRateLimit(app);
  const depois = await http(app)
    .get(`/companies/${empresa.id}`)
    .set('cookie', a.cookie)
    .expect(200);
  expect(depois.body.data.name).toBe('Empresa da A');
  expect(depois.body.data.active).toBe(true);
  expect(depois.body.data.contacts).toHaveLength(2);
});

test('template derivado pela A é invisível para a B — 404 na leitura e em toda edição', async () => {
  const { a, b } = await duasContabilidades();
  const produto = await productTemplate();
  const derivado = await http(app)
    .post(`/checklist-templates/${produto.id}/derive`)
    .set('cookie', a.cookie)
    .send({ name: 'Template só da A' })
    .expect(201);
  const id = derivado.body.data.id as string;
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
    .patch(`/checklist-templates/${id}/items/${FANTASMA}`)
    .set('cookie', b.cookie)
    .send({ required: false })
    .expect(404);
  await http(app)
    .delete(`/checklist-templates/${id}/items/${FANTASMA}`)
    .set('cookie', b.cookie)
    .expect(404);

  const listaDaB = await http(app).get('/checklist-templates').set('cookie', b.cookie).expect(200);
  expect(listaDaB.body.data.map((t: { name: string }) => t.name)).not.toContain('Template só da A');
});

test('listagem de Empresas não vaza linha nem total de outro tenant', async () => {
  const { a, b } = await duasContabilidades();
  await insertCompany(b.firm.id, { name: 'Empresa da B 1' });
  await insertCompany(b.firm.id, { name: 'Empresa da B 2' });

  const daA = await http(app).get('/companies').set('cookie', a.cookie).expect(200);
  expect(daA.body.data.map((r: { name: string }) => r.name)).toEqual(['Empresa da A']);
  expect(daA.body.meta.total).toBe(1);

  const daB = await http(app).get('/companies').set('cookie', b.cookie).expect(200);
  expect(daB.body.meta.total).toBe(2);
});

test('Tipo de Documento próprio da A não aparece no catálogo da B nem serve para a B', async () => {
  const { a, b, empresa } = await duasContabilidades();
  const [proprio] = await db
    .insert(documentType)
    .values({
      accountingFirmId: a.firm.id,
      name: 'Planilha interna da A',
      category: 'corporate',
      acceptedFormats: ['xlsx'],
    })
    .returning();

  const catalogoDaB = await http(app)
    .get('/document-types?perPage=100')
    .set('cookie', b.cookie)
    .expect(200);
  expect(catalogoDaB.body.data.map((r: { id: string }) => r.id)).not.toContain(proprio.id);

  const empresaDaB = await insertCompany(b.firm.id, { name: 'Empresa da B' });
  const recusa = await http(app)
    .put(`/companies/${empresaDaB.id}/checklist-overrides`)
    .set('cookie', b.cookie)
    .send({ documentTypeId: proprio.id, action: 'add' })
    .expect(422);
  expect(recusa.body.error.code).toBe('DOCUMENT_TYPE_NOT_VISIBLE');

  const catalogoDaA = await http(app)
    .get('/document-types?perPage=100')
    .set('cookie', a.cookie)
    .expect(200);
  expect(catalogoDaA.body.data.map((r: { id: string }) => r.id)).toContain(proprio.id);
  expect(empresa.id).toBeDefined();
});

test('sem sessão nenhuma rota do Cadastro responde — 401, não 404', async () => {
  await resetDatabase();

  await http(app).get('/companies').expect(401);
  await http(app).get('/document-types').expect(401);
  await http(app).get('/checklist-templates').expect(401);
  await http(app).post('/companies').send({ name: 'X' }).expect(401);
});

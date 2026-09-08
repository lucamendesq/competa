import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { checklistTemplate, company, contact } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  createCompany,
  createFirm,
  insertCompany,
  productTemplate,
} from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** Cadastro de Empresa: o que a rota aceita, o que recusa e o que sobra no banco. */

let app: INestApplication;

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

test('cadastro com Responsável grava a Empresa e o Responsável na mesma operação', async () => {
  const session = await createAccountantSession(app);
  const template = await productTemplate();

  const response = await http(app)
    .post('/companies')
    .set('cookie', session.cookie)
    .send({
      name: 'Padaria Central',
      checklistTemplateId: template.id,
      contact: { name: 'Ana', email: 'ana@padaria.com', phone: '11999998888' },
    })
    .expect(201);

  expect(response.body.data.name).toBe('Padaria Central');
  expect(response.body.data.contacts).toHaveLength(1);

  const rows = await db.select().from(contact);
  expect(rows).toHaveLength(1);
  expect(rows[0].email).toBe('ana@padaria.com');
});

test('Empresa pode nascer sem Responsável — o Responsável é cadastrado depois', async () => {
  const session = await createAccountantSession(app);
  const template = await productTemplate();

  const response = await http(app)
    .post('/companies')
    .set('cookie', session.cookie)
    .send({ name: 'Sem Responsável', checklistTemplateId: template.id })
    .expect(201);

  expect(response.body.data.contacts).toEqual([]);
  expect(await db.select().from(contact)).toHaveLength(0);
});

test('email de Responsável inválido recusa o cadastro inteiro — nem Empresa nem Responsável entram', async () => {
  const session = await createAccountantSession(app);
  const template = await productTemplate();

  await http(app)
    .post('/companies')
    .set('cookie', session.cookie)
    .send({
      name: 'Empresa Torta',
      checklistTemplateId: template.id,
      contact: { name: 'Ana', email: 'ana-arroba-nada' },
    })
    .expect(422);

  expect(await db.select().from(company)).toHaveLength(0);
  expect(await db.select().from(contact)).toHaveLength(0);
});

test('CNPJ com dígito verificador errado é recusado, mesmo com 14 dígitos', async () => {
  const session = await createAccountantSession(app);
  const template = await productTemplate();

  const response = await http(app)
    .post('/companies')
    .set('cookie', session.cookie)
    .send({ name: 'CNPJ Falso', checklistTemplateId: template.id, cnpj: '11.222.333/0001-44' })
    .expect(422);

  expect(JSON.stringify(response.body.error.details)).toMatch(/dígitos verificadores/);
  expect(await db.select().from(company)).toHaveLength(0);
});

test('CNPJ com máscara é normalizado para 14 dígitos', async () => {
  const session = await createAccountantSession(app);
  const created = await createCompany(app, session.cookie, { cnpj: '11.222.333/0001-81' });

  const [row] = await db.select().from(company).where(eq(company.id, created.id));
  expect(row.cnpj).toBe('11222333000181');
});

test('CNPJ que não tem 14 dígitos é recusado com 422', async () => {
  const session = await createAccountantSession(app);
  const template = await productTemplate();

  const response = await http(app)
    .post('/companies')
    .set('cookie', session.cookie)
    .send({ name: 'CNPJ Curto', checklistTemplateId: template.id, cnpj: '11.222.333/0001' })
    .expect(422);

  expect(response.body.error.code).toBe('VALIDATION_ERROR');
  expect(await db.select().from(company)).toHaveLength(0);
});

test('flags jsonb do cadastro persistem e voltam na leitura', async () => {
  const session = await createAccountantSession(app);
  const created = await createCompany(app, session.cookie, {
    flags: { has_employees: true, has_inventory: false },
  });

  const response = await http(app)
    .get(`/companies/${created.id}`)
    .set('cookie', session.cookie)
    .expect(200);

  expect(response.body.data.flags).toEqual({ has_employees: true, has_inventory: false });
});

test('PATCH de uma flag não apaga as flags que já estavam gravadas', async () => {
  const session = await createAccountantSession(app);
  const created = await createCompany(app, session.cookie, { flags: { has_employees: true } });

  const response = await http(app)
    .patch(`/companies/${created.id}`)
    .set('cookie', session.cookie)
    .send({ flags: { has_inventory: true } })
    .expect(200);

  expect(response.body.data.flags).toEqual({ has_employees: true, has_inventory: true });
});

test('PATCH altera nome e CNPJ sem tocar no resto', async () => {
  const session = await createAccountantSession(app);
  const created = await createCompany(app, session.cookie, { cnpj: '11222333000181' });

  await http(app)
    .patch(`/companies/${created.id}`)
    .set('cookie', session.cookie)
    .send({ name: 'Nome Novo', cnpj: null })
    .expect(200);

  const [row] = await db.select().from(company).where(eq(company.id, created.id));
  expect(row.name).toBe('Nome Novo');
  expect(row.cnpj).toBeNull();
  expect(row.active).toBe(true);
});

test('template de checklist de outra Contabilidade é recusado com 422 no cadastro e no PATCH', async () => {
  const session = await createAccountantSession(app);
  const other = await createFirm('Contabilidade Vizinha');
  const [foreign] = await db
    .insert(checklistTemplate)
    .values({ accountingFirmId: other.id, name: 'Template da Vizinha' })
    .returning();
  const created = await createCompany(app, session.cookie);

  const create = await http(app)
    .post('/companies')
    .set('cookie', session.cookie)
    .send({ name: 'Roubada', checklistTemplateId: foreign.id })
    .expect(422);
  expect(create.body.error.message).toMatch(/other Contabilidade/);

  await http(app)
    .patch(`/companies/${created.id}`)
    .set('cookie', session.cookie)
    .send({ checklistTemplateId: foreign.id })
    .expect(422);
});

test('DELETE desativa a Empresa: ela continua existindo e sai só da listagem de ativas', async () => {
  const session = await createAccountantSession(app);
  const created = await createCompany(app, session.cookie, { name: 'Vai Desativar' });

  await http(app).delete(`/companies/${created.id}`).set('cookie', session.cookie).expect(200);

  const [row] = await db.select().from(company).where(eq(company.id, created.id));
  expect(row.active).toBe(false);

  const active = await http(app)
    .get('/companies?active=true')
    .set('cookie', session.cookie)
    .expect(200);
  expect(active.body.data).toEqual([]);
  expect(active.body.meta.total).toBe(0);

  const inativas = await http(app)
    .get('/companies?active=false')
    .set('cookie', session.cookie)
    .expect(200);
  expect(inativas.body.data.map((r: { name: string }) => r.name)).toEqual(['Vai Desativar']);
});

test('Empresa desativada continua legível pelo id — desativar não é apagar', async () => {
  const session = await createAccountantSession(app);
  const created = await createCompany(app, session.cookie);
  await http(app).delete(`/companies/${created.id}`).set('cookie', session.cookie).expect(200);

  const response = await http(app)
    .get(`/companies/${created.id}`)
    .set('cookie', session.cookie)
    .expect(200);

  expect(response.body.data.active).toBe(false);
});

test('Empresa inexistente responde 404 em leitura, edição e desativação', async () => {
  const session = await createAccountantSession(app);
  const ghost = '01a06884-0000-7000-8000-000000000000';

  await http(app).get(`/companies/${ghost}`).set('cookie', session.cookie).expect(404);
  await http(app)
    .patch(`/companies/${ghost}`)
    .set('cookie', session.cookie)
    .send({ name: 'X' })
    .expect(404);
  await http(app).delete(`/companies/${ghost}`).set('cookie', session.cookie).expect(404);
});

test('paginação devolve a página pedida e o total de todas as Empresas do escopo', async () => {
  const session = await createAccountantSession(app);
  for (const name of ['Alfa', 'Beta', 'Gama']) {
    await insertCompany(session.firm.id, { name });
  }

  const first = await http(app)
    .get('/companies?page=1&perPage=2')
    .set('cookie', session.cookie)
    .expect(200);
  expect(first.body.data.map((r: { name: string }) => r.name)).toEqual(['Alfa', 'Beta']);
  expect(first.body.meta).toEqual({ page: 1, perPage: 2, total: 3 });

  const second = await http(app)
    .get('/companies?page=2&perPage=2')
    .set('cookie', session.cookie)
    .expect(200);
  expect(second.body.data.map((r: { name: string }) => r.name)).toEqual(['Gama']);
  expect(second.body.meta.total).toBe(3);
});

test('listagem traz o nome do template e a contagem de Responsáveis de cada Empresa', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Com Dois' });
  const template = await productTemplate();

  const response = await http(app).get('/companies').set('cookie', session.cookie).expect(200);

  expect(response.body.data[0]).toMatchObject({
    name: 'Com Dois',
    templateName: template.name,
    contactCount: 1,
  });
});

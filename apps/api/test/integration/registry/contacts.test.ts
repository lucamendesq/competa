import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { contact } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, insertContact } from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** Responsável: quem recebe o link. Sem email não existe Solicitação — o email é
 *  invariante do domínio, não campo opcional de formulário. */

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

const setup = async () => {
  const session = await createAccountantSession(app);
  const company = await createCompany(app, session.cookie, { contact: undefined });

  return { session, company };
};

test('Responsável adicionado depois entra na Empresa e aparece na listagem', async () => {
  const { session, company } = await setup();

  const created = await http(app)
    .post(`/companies/${company.id}/contacts`)
    .set('cookie', session.cookie)
    .send({ name: 'Bruno', email: 'bruno@empresa.com', phone: '11988887777' })
    .expect(201);

  expect(created.body.data.email).toBe('bruno@empresa.com');

  const list = await http(app)
    .get(`/companies/${company.id}/contacts`)
    .set('cookie', session.cookie)
    .expect(200);
  expect(list.body.data).toHaveLength(1);
});

test('Responsável sem email é recusado com 422 e nada é gravado', async () => {
  const { session, company } = await setup();

  await http(app)
    .post(`/companies/${company.id}/contacts`)
    .set('cookie', session.cookie)
    .send({ name: 'Sem Email' })
    .expect(422);

  expect(await db.select().from(contact)).toHaveLength(0);
});

test('uma Empresa pode ter vários Responsáveis', async () => {
  const { session, company } = await setup();
  await insertContact(company.id, { name: 'Um', email: 'um@empresa.com' });
  await insertContact(company.id, { name: 'Dois', email: 'dois@empresa.com' });

  const list = await http(app)
    .get(`/companies/${company.id}/contacts`)
    .set('cookie', session.cookie)
    .expect(200);

  expect(list.body.data.map((r: { name: string }) => r.name).sort()).toEqual(['Dois', 'Um']);
});

test('editar Responsável troca só os campos enviados', async () => {
  const { session, company } = await setup();
  const existente = await insertContact(company.id, { name: 'Antigo', email: 'antigo@e.com' });

  const response = await http(app)
    .patch(`/companies/${company.id}/contacts/${existente.id}`)
    .set('cookie', session.cookie)
    .send({ name: 'Atualizado' })
    .expect(200);

  expect(response.body.data).toMatchObject({ name: 'Atualizado', email: 'antigo@e.com' });
});

test('editar Responsável com email inválido é recusado com 422', async () => {
  const { session, company } = await setup();
  const existente = await insertContact(company.id);

  await http(app)
    .patch(`/companies/${company.id}/contacts/${existente.id}`)
    .set('cookie', session.cookie)
    .send({ email: 'nao-e-email' })
    .expect(422);
});

test('remover Responsável responde 204 e a segunda remoção responde 404', async () => {
  const { session, company } = await setup();
  const existente = await insertContact(company.id);

  await http(app)
    .delete(`/companies/${company.id}/contacts/${existente.id}`)
    .set('cookie', session.cookie)
    .expect(204);

  expect(await db.select().from(contact)).toHaveLength(0);

  await http(app)
    .delete(`/companies/${company.id}/contacts/${existente.id}`)
    .set('cookie', session.cookie)
    .expect(404);
});

test('Responsável de outra Empresa da mesma Contabilidade não é editável pelo id da Empresa errada', async () => {
  const { session, company } = await setup();
  const other = await createCompany(app, session.cookie, { name: 'Outra Empresa' });
  const foreign = await insertContact(other.id);

  await http(app)
    .patch(`/companies/${company.id}/contacts/${foreign.id}`)
    .set('cookie', session.cookie)
    .send({ name: 'Invadido' })
    .expect(404);

  await http(app)
    .delete(`/companies/${company.id}/contacts/${foreign.id}`)
    .set('cookie', session.cookie)
    .expect(404);
});

import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { contact, pushSubscription, uploadLink } from '../../../src/infra/database/schema/index.js';
import { cookieHeader, createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod } from '../../factories.js';
import { MessageProvider } from '../../../src/modules/messaging/providers/message.provider.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** O que a tela de sucesso do envio oferece (D14): ativar avisos neste aparelho e ativar
 *  acesso — as duas em um toque, atrás do token do Link, nenhuma pré-requisito de nada. E
 *  o "perdi meu link" da home, que responde igual nos três desfechos. */

let app: INestApplication;
const sent: { recipient: string; subject: string; body: string }[] = [];

beforeAll(async () => {
  useOwnPort(3971);
  app = await createTestApp();

  const provider = app.get(MessageProvider);
  vi.spyOn(provider, 'send').mockImplementation(async (message) => {
    sent.push(message);
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
  sent.length = 0;
});

/** O listener de `messaging` é chamado por `emit` sem await: a resposta da abertura volta
 *  antes de o email do Link sair. Sem esperar por ele, a entrega da abertura aparece no
 *  espião DEPOIS do `sent.length = 0` e conta como email do teste seguinte. */
const awaitDelivery = async (count: number) => {
  for (let attempt = 0; attempt < 100 && sent.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const setup = async () => {
  const session = await createAccountantSession(app);
  const company = await createCompany(app, session.cookie, {
    name: 'Padaria Central',
    contact: { name: 'Ana', email: 'ana@padaria.com' },
  });
  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  await awaitDelivery(1);
  sent.length = 0;

  return { session, company, token: opened.tokenFor('Padaria Central') };
};

test('ativar acesso pelo Link é um toque: sessão na resposta, sem senha e sem outro email', async () => {
  const { token } = await setup();

  const response = await http(app).post(`/upload/${token}/access`).send({}).expect(201);

  expect(response.body.data.email).toBe('ana@padaria.com');
  // nenhum segundo email: o magic link é gerado e consumido dentro da requisição
  expect(sent).toHaveLength(0);

  const [row] = await db.select().from(contact).where(eq(contact.email, 'ana@padaria.com'));
  expect(row.authUserId).not.toBeNull();

  await http(app)
    .get('/my/profile')
    .set('cookie', cookieHeader(response.headers['set-cookie']))
    .expect(200);
});

test('ativar acesso duas vezes é recusado', async () => {
  const { token } = await setup();

  await http(app).post(`/upload/${token}/access`).send({}).expect(201);
  await http(app).post(`/upload/${token}/access`).send({}).expect(409);
});

test('link inválido não ativa acesso nem inscreve push', async () => {
  await setup();

  await http(app).post('/upload/token-invalido/access').send({}).expect(404);
  await http(app)
    .post('/upload/token-invalido/push')
    .send({ endpoint: 'https://exemplo.push/x', keys: { p256dh: 'a', auth: 'b' } })
    .expect(404);

  const [row] = await db.select().from(contact).where(eq(contact.email, 'ana@padaria.com'));
  expect(row.authUserId).toBeNull();
});

/** D14, item 3: push se liga ao `contact`, não à Solicitação — é o que faz a inscrição
 *  sobreviver ao fan-out do mês seguinte, que emite um `upload_link` novo. */
test('push é ativado pelo Link, SEM conta, e fica no Responsável', async () => {
  const { token, company } = await setup();

  await http(app)
    .post(`/upload/${token}/push`)
    .send({
      endpoint: 'https://exemplo.push/abc',
      keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
    })
    .expect(201);

  const [row] = await db.select().from(pushSubscription);
  expect(row.contactId).toBe(company.contacts[0].id);

  const [owner] = await db.select().from(contact).where(eq(contact.id, row.contactId));
  expect(owner.authUserId).toBeNull();
});

test('reinscrever o mesmo aparelho é upsert, não linha nova', async () => {
  const { token } = await setup();
  const body = {
    endpoint: 'https://exemplo.push/abc',
    keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
  };

  await http(app).post(`/upload/${token}/push`).send(body).expect(201);
  await http(app).post(`/upload/${token}/push`).send(body).expect(201);

  expect(await db.select().from(pushSubscription)).toHaveLength(1);
});

test('"perdi meu link" reenvia o Link e invalida o anterior', async () => {
  const { token } = await setup();

  await http(app).post('/access/recover').send({ email: 'ana@padaria.com' }).expect(201);
  await awaitDelivery(1);

  expect(sent).toHaveLength(1);
  const resent = sent[0].body.match(/\/envio\/([A-Za-z0-9_-]+)/)![1];

  expect(resent).not.toBe(token);
  await http(app).get(`/upload/${resent}`).expect(200);
  await http(app).get(`/upload/${token}`).expect(404);
});

/** A resposta é a mesma nos três desfechos: dizer "não encontramos" entregaria a quem
 *  tenta adivinhar um oráculo de quem é cliente de quem. */
/** Empresa com dois Responsáveis: quem pede o link passa a ser o dono dele, senão tudo o
 *  que ele enviar entra no histórico com a autoria do outro. */
test('"perdi meu link" do segundo Responsável reaponta o Link para ele', async () => {
  const { session, company } = await setup();

  await http(app)
    .post(`/companies/${company.id}/contacts`)
    .set('cookie', session.cookie)
    .send({ name: 'Bruno', email: 'bruno@padaria.com' })
    .expect(201);

  sent.length = 0;
  await http(app).post('/access/recover').send({ email: 'bruno@padaria.com' }).expect(201);
  await awaitDelivery(1);

  const resent = sent[0].body.match(/\/envio\/([A-Za-z0-9_-]+)/)![1];
  const [link] = await db.select().from(uploadLink);
  const [bruno] = await db.select().from(contact).where(eq(contact.email, 'bruno@padaria.com'));

  expect(sent[0].recipient).toBe('bruno@padaria.com');
  expect(link.contactId).toBe(bruno.id);
  await http(app).get(`/upload/${resent}`).expect(200);
});

test('"perdi meu link" responde igual para email desconhecido, e não manda nada', async () => {
  await setup();

  const known = await http(app)
    .post('/access/recover')
    .send({ email: 'ana@padaria.com' })
    .expect(201);
  resetThrottle(app);
  const unknown = await http(app)
    .post('/access/recover')
    .send({ email: 'ninguem@lugar.com' })
    .expect(201);

  expect(unknown.body).toEqual(known.body);

  // só o email conhecido gerou envio
  await awaitDelivery(1);
  expect(sent).toHaveLength(1);
});

test('"perdi meu link" tem limite: a quarta tentativa no minuto responde 429', async () => {
  await setup();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await http(app).post('/access/recover').send({ email: 'ana@padaria.com' }).expect(201);
  }

  await http(app).post('/access/recover').send({ email: 'ana@padaria.com' }).expect(429);
});

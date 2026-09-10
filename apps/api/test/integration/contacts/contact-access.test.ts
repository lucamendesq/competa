import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { contact, pushSubscription } from '../../../src/infra/database/schema/index.js';
import { cookieHeader, createTestApp, http, resetRateLimit } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { addDays } from 'date-fns';
import { invite } from '../../../src/infra/database/schema/index.js';
import { createToken } from '../../../src/lib/token.js';
import { createAccountantSession, createCompany } from '../../factories.js';

/** Conta do Responsável (D14): opcional e nunca pré-requisito. Pelo CONVITE ele define uma
 *  senha — o convite é de uso único e não serve de entrada depois de aceito. Pelo Link de
 *  Upload é um toque, sem senha (esse link é renovado todo mês). O Contador revoga. */

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetRateLimit(app);
});

const setup = async () => {
  const session = await createAccountantSession(app);
  const company = await createCompany(app, session.cookie, {
    name: 'Padaria Central',
    contact: { name: 'Ana', email: 'ana@padaria.com' },
  });

  const { token } = await inviteFor(company.id, 'ana@padaria.com');

  return { session, company, token };
};

const PASSWORD = 'senha-forte-123';

/** Entrada normal de quem aceitou um convite: email e senha. */
const signInAsContact = async (email = 'ana@padaria.com', password = PASSWORD) => {
  const signIn = await http(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .expect(200);

  return cookieHeader(signIn.headers['set-cookie']);
};

/** Convite com token conhecido — o real vai no email, que o teste não abre. */
const inviteFor = async (companyId: string, email: string) => {
  const { token, tokenHash } = createToken();

  await db
    .insert(invite)
    .values({ email, tokenHash, companyId, expiresAt: addDays(new Date(), 7) });

  return { token };
};

test('o convite cria o acesso com senha, e a senha entra de primeira', async () => {
  const { token } = await setup();

  const response = await http(app)
    .post(`/invites/${token}/contact-account`)
    .send({ password: PASSWORD })
    .expect(201);

  expect(response.body.data.email).toBe('ana@padaria.com');

  const [row] = await db.select().from(contact).where(eq(contact.email, 'ana@padaria.com'));
  expect(row.authUserId).not.toBeNull();

  await http(app)
    .get('/my/profile')
    .set('cookie', await signInAsContact())
    .expect(200);
});

test('senha curta é recusada e não deixa conta pela metade', async () => {
  const { token } = await setup();

  await http(app).post(`/invites/${token}/contact-account`).send({ password: 'curta' }).expect(422);

  const [row] = await db.select().from(contact).where(eq(contact.email, 'ana@padaria.com'));
  expect(row.authUserId).toBeNull();
});

/** O convite é de uso único. Quem reaproveitar o link recebe 409 — e a tela manda para a
 *  entrada, porque ele JÁ tem senha e não fica sem porta. */
test('aceitar o mesmo convite duas vezes é recusado', async () => {
  const { token } = await setup();

  await http(app)
    .post(`/invites/${token}/contact-account`)
    .send({ password: PASSWORD })
    .expect(201);
  await http(app)
    .post(`/invites/${token}/contact-account`)
    .send({ password: PASSWORD })
    .expect(409);
});

test('token inválido não cria acesso nenhum', async () => {
  await setup();

  await http(app)
    .post('/invites/token-que-nao-existe/contact-account')
    .send({ password: PASSWORD })
    .expect(404);

  const [row] = await db.select().from(contact).where(eq(contact.email, 'ana@padaria.com'));
  expect(row.authUserId).toBeNull();
});

test('sem sessão, a área do Responsável responde 401', async () => {
  await setup();

  await http(app).get('/my/profile').expect(401);
  await http(app).get('/my/pending').expect(401);
});

test('sessão de Contador NÃO vira sessão de Responsável', async () => {
  const { session } = await setup();

  const response = await http(app).get('/my/profile').set('cookie', session.cookie).expect(403);

  expect(response.body.error.code).toBe('FORBIDDEN');
});

test('Contador vê quem tem acesso, revoga, e a sessão do Responsável morre', async () => {
  const { token, company, session } = await setup();
  await http(app)
    .post(`/invites/${token}/contact-account`)
    .send({ password: PASSWORD })
    .expect(201);
  const contactCookie = await signInAsContact();

  await http(app).get('/my/profile').set('cookie', contactCookie).expect(200);

  await http(app)
    .post('/my/push/subscribe')
    .set('cookie', contactCookie)
    .send({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
    })
    .expect(201);

  const withAccess = await http(app)
    .get(`/companies/${company.id}/contacts/access`)
    .set('cookie', session.cookie)
    .expect(200);
  expect(withAccess.body.data).toHaveLength(1);

  const revoked = await http(app)
    .delete(`/companies/${company.id}/contacts/${company.contacts[0].id}/access`)
    .set('cookie', session.cookie)
    .expect(200);
  expect(revoked.body.data.revoked).toBe(true);

  // sessão cai na hora, vínculo sai e a inscrição de push vai junto
  await http(app).get('/my/profile').set('cookie', contactCookie).expect(401);

  const [row] = await db.select().from(contact).where(eq(contact.id, company.contacts[0].id));
  expect(row.authUserId).toBeNull();
  expect(await db.select().from(pushSubscription)).toHaveLength(0);
});

test('revogar Responsável de outra Contabilidade responde 404', async () => {
  const { company } = await setup();
  const rival = await createAccountantSession(app, { firmName: 'Rival' });

  await http(app)
    .delete(`/companies/${company.id}/contacts/${company.contacts[0].id}/access`)
    .set('cookie', rival.cookie)
    .expect(404);
});

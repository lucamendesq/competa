import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { contact, pushSubscription, user } from '../../../src/infra/database/schema/index.js';
import { cookieHeader, createTestApp, http, resetRateLimit } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod } from '../../factories.js';

/** Fase 10: acesso do Responsável. A conta nasce da credencial que já circula (o token do
 *  Link prova posse do email), a entrada é por magic link/passkey — sem senha — e o
 *  Contador pode revogar. */

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
  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  return { session, company, period, token: period.tokenFor('Padaria Central') };
};

/** Entra como Responsável seguindo o magic link (o host do link é o BETTER_AUTH_URL, então
 *  o teste bate no servidor da suíte). */
const signInAsContact = async (email: string) => {
  await http(app).post('/api/auth/sign-in/magic-link').send({ email }).expect(200);

  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  expect(row, 'o Responsável precisa ter conta antes de entrar').toBeDefined();

  // sem `callbackURL` o verify responde 200 com a sessão; com, responde 302 — o que
  // interessa é o cookie que vem nos dois casos
  const verification = await http(app)
    .get('/api/auth/magic-link/verify')
    .query({ token: await lastMagicLinkToken() });

  expect([200, 302]).toContain(verification.status);

  return cookieHeader(verification.headers['set-cookie']);
};

/** O token em claro só existe no email; o teste lê o `verification` mais recente. */
const lastMagicLinkToken = async () => {
  const rows = await db.execute(
    `select identifier from verification order by created_at desc limit 1`,
  );
  const identifier = (rows as unknown as { rows: { identifier: string }[] }).rows?.[0]?.identifier;

  return identifier;
};

test('acesso nasce do Link de Upload: sem senha, sem convite', async () => {
  const { token } = await setup();

  const response = await http(app).post(`/upload/${token}/account`).send({}).expect(201);

  expect(response.body.data.email).toBe('ana@padaria.com');
  expect(response.body.data.nextStep).toBe('passkey_or_magic_link');

  const [row] = await db.select().from(contact).where(eq(contact.email, 'ana@padaria.com'));
  expect(row.authUserId).not.toBeNull();

  // conta sem senha: nada em `account` (é lá que a credencial de senha viveria)
  const [created] = await db.select().from(user).where(eq(user.email, 'ana@padaria.com'));
  expect(created.emailVerified).toBe(false);
});

test('criar acesso duas vezes pelo mesmo Link é recusado', async () => {
  const { token } = await setup();

  await http(app).post(`/upload/${token}/account`).send({}).expect(201);
  const again = await http(app).post(`/upload/${token}/account`).send({}).expect(409);

  expect(again.body.error.code).toBe('CONTACT_ACCESS_ALREADY_EXISTS');
});

test('token inválido não cria acesso nenhum', async () => {
  await setup();

  await http(app).post('/upload/token-que-nao-existe/account').send({}).expect(404);

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

  // o Contador tem sessão válida, mas não é `contact` de Empresa nenhuma
  const response = await http(app).get('/my/profile').set('cookie', session.cookie).expect(403);

  expect(response.body.error.code).toBe('FORBIDDEN');
});

test('Contador vê quem tem acesso, revoga, e a sessão do Responsável morre', async () => {
  const { token, company, session } = await setup();
  await http(app).post(`/upload/${token}/account`).send({}).expect(201);
  const contactCookie = await signInAsContact('ana@padaria.com');

  await http(app).get('/my/profile').set('cookie', contactCookie).expect(200);

  await http(app)
    .post('/my/push/subscribe')
    .set('cookie', contactCookie)
    .send({
      endpoint: 'https://exemplo.push/abc',
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

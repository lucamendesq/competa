import { beforeAll, beforeEach, expect, test } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { addDays } from 'date-fns';
import { cookieHeader, createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession } from '../../factories.js';
import { invite } from '../../../src/infra/database/schema/index.js';
import { createToken } from '../../../src/lib/token.js';

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await resetDatabase();
});

/** Entra um segundo Contador na MESMA Contabilidade, pelo convite que o dono cria.
 *  É o caminho real: não há outra porta para virar Contador de um tenant. */
const inviteSecondAccountant = async (donoCookie: string, accountingFirmId: string) => {
  const email = `convidado-${Date.now()}@teste.com`;
  const password = 'senha-forte-123';
  const { token, tokenHash } = createToken();

  await db.insert(invite).values({
    email,
    tokenHash,
    accountingFirmId,
    expiresAt: addDays(new Date(), 7),
  });

  await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Contador Convidado', email, password })
    .expect(201);

  const signIn = await http(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .expect(200);

  return { email, cookie: cookieHeader(signIn.headers['set-cookie']), donoCookie };
};

test('o primeiro Contador da Contabilidade é o dono', async () => {
  const session = await createAccountantSession(app);

  const me = await http(app).get('/auth/me').set('cookie', session.cookie).expect(200);

  expect(me.body.data.accountant.owner).toBe(true);
});

test('o dono convida outro Contador', async () => {
  const session = await createAccountantSession(app);

  const response = await http(app)
    .post('/invites')
    .set('cookie', session.cookie)
    .send({ email: 'socio@teste.com' })
    .expect(201);

  expect(response.body.data.email).toBe('socio@teste.com');
  expect(response.body.data.url).toContain('/convite/');
});

test('Contador convidado NÃO é dono e NÃO convida', async () => {
  const owner = await createAccountantSession(app);
  const invited = await inviteSecondAccountant(owner.cookie, owner.firm.id);

  const me = await http(app).get('/auth/me').set('cookie', invited.cookie).expect(200);
  expect(me.body.data.accountant.owner).toBe(false);

  const response = await http(app)
    .post('/invites')
    .set('cookie', invited.cookie)
    .send({ email: 'mais-um@teste.com' })
    .expect(403);

  expect(response.body.error.code).toBe('ONLY_OWNER_CAN_INVITE');
});

test('cada Contabilidade tem o seu próprio dono', async () => {
  const first = await createAccountantSession(app, { firmName: 'Contabilidade A' });
  const second = await createAccountantSession(app, { firmName: 'Contabilidade B' });

  for (const session of [first, second]) {
    const me = await http(app).get('/auth/me').set('cookie', session.cookie).expect(200);
    expect(me.body.data.accountant.owner).toBe(true);
  }
});

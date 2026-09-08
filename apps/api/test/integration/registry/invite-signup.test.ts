import type { INestApplication } from '@nestjs/common';
import { addDays, subDays } from 'date-fns';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { accountant, invite, user } from '../../../src/infra/database/schema/index.js';
import { createToken } from '../../../src/lib/token.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createFirm, insertCompany } from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** Convite → conta de Contador. O convite é a única porta de entrada: quem entra por ela
 *  sai vinculado a exatamente uma Contabilidade, e o convite queima. */

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

/** Convite direto no banco: é assim que se fabrica um convite expirado/aceito/de Empresa. */
const insertInvite = async (values: Partial<typeof invite.$inferInsert> = {}) => {
  const { token, tokenHash } = createToken();
  const firm = values.companyId ? undefined : (values.accountingFirmId ?? (await createFirm()).id);
  const [row] = await db
    .insert(invite)
    .values({
      email: 'convidado@teste.com',
      tokenHash,
      accountingFirmId: firm ?? null,
      expiresAt: addDays(new Date(), 7),
      ...values,
    })
    .returning();

  return { token, row };
};

test('convite criado pelo Contador devolve o link e o preview mostra para quem ele vale', async () => {
  const session = await createAccountantSession(app, { firmName: 'Contabilidade Alfa' });

  const created = await http(app)
    .post('/invites')
    .set('cookie', session.cookie)
    .send({ email: 'novo@contador.com' })
    .expect(201);

  expect(created.body.data.email).toBe('novo@contador.com');
  const token = (created.body.data.url as string).split('/').pop()!;

  const preview = await http(app).get(`/invites/${token}`).expect(200);
  expect(preview.body.data).toEqual({
    email: 'novo@contador.com',
    invitedBy: 'Contabilidade Alfa',
    // convite de Contador não é de Empresa nenhuma
    companyName: null,
    target: 'accounting_firm',
  });
});

test('sign-up pelo convite cria o Contador da Contabilidade convidante e queima o convite', async () => {
  const { token, row } = await insertInvite({ email: 'novato@teste.com' });

  const response = await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Novato', email: 'novato@teste.com', password: 'senha-forte-123' })
    .expect(201);

  const [created] = await db
    .select()
    .from(accountant)
    .where(eq(accountant.authUserId, response.body.data.userId));
  expect(created.accountingFirmId).toBe(row.accountingFirmId);

  const [usado] = await db.select().from(invite).where(eq(invite.id, row.id));
  expect(usado.acceptedAt).not.toBeNull();
});

test('/auth/me devolve o Contador e a Contabilidade da sessão', async () => {
  const session = await createAccountantSession(app, { firmName: 'Contabilidade Beta' });

  const response = await http(app).get('/auth/me').set('cookie', session.cookie).expect(200);

  expect(response.body.data.accountant.email).toBe(session.email);
  expect(response.body.data.accountingFirm).toMatchObject({
    id: session.firm.id,
    name: 'Contabilidade Beta',
  });
});

test('convite expirado responde 410 no preview e no sign-up', async () => {
  const { token } = await insertInvite({ expiresAt: subDays(new Date(), 1) });

  const preview = await http(app).get(`/invites/${token}`).expect(410);
  expect(preview.body.error.code).toBe('INVITE_EXPIRED');

  await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Atrasado', email: 'convidado@teste.com', password: 'senha-forte-123' })
    .expect(410);

  expect(await db.select().from(user)).toHaveLength(0);
});

test('convite já aceito responde 409 — link não é reutilizável', async () => {
  const { token } = await insertInvite({ acceptedAt: new Date() });

  const preview = await http(app).get(`/invites/${token}`).expect(409);
  expect(preview.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');

  await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Repetido', email: 'convidado@teste.com', password: 'senha-forte-123' })
    .expect(409);
});

test('sign-up com email diferente do convite responde 422 e não cria conta', async () => {
  const { token } = await insertInvite({ email: 'certo@teste.com' });

  const response = await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Trocado', email: 'outro@teste.com', password: 'senha-forte-123' })
    .expect(422);

  expect(response.body.error.code).toBe('INVITE_EMAIL_MISMATCH');
  expect(await db.select().from(user)).toHaveLength(0);
});

test('senha curta é recusada com 422 antes de qualquer escrita', async () => {
  const { token, row } = await insertInvite();

  await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Curta', email: 'convidado@teste.com', password: '1234' })
    .expect(422);

  expect(await db.select().from(user)).toHaveLength(0);
  const [intacto] = await db.select().from(invite).where(eq(invite.id, row.id));
  expect(intacto.acceptedAt).toBeNull();
});

test('convite de Empresa é recusado no sign-up, mas o preview já diz que é de Empresa', async () => {
  const firm = await createFirm();
  const company = await insertCompany(firm.id, { name: 'Padaria Convidante' });
  const { token } = await insertInvite({
    companyId: company.id,
    accountingFirmId: null,
    email: 'responsavel@padaria.com',
  });

  /* `invitedBy` é sempre a Contabilidade — é ela quem cobra, e é o nome que o Responsável
   * reconhece. A Empresa vem em `companyName`, que a tela do convite mostra à parte. */
  const preview = await http(app).get(`/invites/${token}`).expect(200);
  expect(preview.body.data).toMatchObject({
    target: 'company',
    invitedBy: firm.name,
    companyName: 'Padaria Convidante',
  });

  const response = await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Responsável', email: 'responsavel@padaria.com', password: 'senha-forte-123' })
    .expect(422);

  expect(response.body.error.code).toBe('INVITE_TARGET_UNSUPPORTED');
  expect(await db.select().from(user)).toHaveLength(0);
});

test('email já cadastrado responde 409 sem deixar Contador nem user órfão', async () => {
  const session = await createAccountantSession(app);
  const { token, row } = await insertInvite({ email: session.email });

  const response = await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Repetido', email: session.email, password: 'outra-senha-123' })
    .expect(409);

  expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  expect(await db.select().from(user)).toHaveLength(1);
  expect(await db.select().from(accountant)).toHaveLength(1);
  const [notAccepted] = await db.select().from(invite).where(eq(invite.id, row.id));
  expect(notAccepted.acceptedAt).toBeNull();
});

test('token de convite inexistente responde 404 sem dizer o que faltou', async () => {
  const preview = await http(app).get('/invites/token-que-nao-existe').expect(404);

  expect(preview.body.error.code).toBe('INVITE_NOT_FOUND');
  expect(preview.body.error.message).not.toMatch(/expirad|aceit/i);
});

test('/auth/me sem sessão responde 401', async () => {
  const response = await http(app).get('/auth/me').expect(401);

  expect(response.body.error.code).toBe('UNAUTHENTICATED');
});

test('cadastro aberto está fechado no Better Auth — só entra por convite', async () => {
  const response = await http(app)
    .post('/api/auth/sign-up/email')
    .send({ name: 'Sem Convite', email: 'sem-convite@teste.com', password: 'senha-forte-123' });

  expect(response.status).toBe(404);
  expect(await db.select().from(user)).toHaveLength(0);
});

test('sessão de conta sem vínculo de Contador responde 403 — autenticado não é autorizado', async () => {
  const session = await createAccountantSession(app);
  await db.delete(accountant);

  const response = await http(app).get('/auth/me').set('cookie', session.cookie).expect(403);

  expect(response.body.error.code).toBe('FORBIDDEN');
});

test('criar convite exige sessão de Contador — 401 sem cookie', async () => {
  await http(app).post('/invites').send({ email: 'alguem@teste.com' }).expect(401);
  expect(await db.select().from(invite)).toHaveLength(0);
});

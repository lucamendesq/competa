import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import {
  accountant,
  accountingFirm,
  invite,
  message,
  subscription,
  user as authUser,
  userDevice,
} from '../src/infra/database/schema/index.js';
import { createToken, hashToken } from '../src/lib/token.js';
import {
  apiClient,
  contactBody,
  createCompany,
  registerFirm,
  uniqueIp,
  type Api,
} from './support/fixtures.js';

const GHOST_ID = '018f0000-0000-7000-8000-00000000dead';
const PASSWORD = 'senha-forte-123';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

let emailSeq = 0;
const uniqueEmail = (label: string) =>
  `${label}-${Date.now().toString(36)}-${++emailSeq}@example.com`;

const cookieOf = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

const rawPost = (path: string, body: unknown, extraHeaders: Record<string, string> = {}) =>
  fetch(`${app.url}${path}`, {
    method: 'POST',
    headers: {
      'x-forwarded-for': uniqueIp(),
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

async function signIn(email: string, password = PASSWORD) {
  const res = await rawPost('/api/auth/sign-in/email', { email, password });
  expect(res.status, await res.clone().text()).toBe(200);
  const cookie = cookieOf(res.headers);
  expect(cookie).not.toBe('');

  return { api: apiClient(app.url, { cookie }), cookie };
}

/** O sign-up por convite NÃO devolve cookie — a sessão só nasce no sign-in separado. */
async function addMember(ownerApi: Api, name = 'Membro') {
  const email = uniqueEmail('membro');

  const invited = await ownerApi.post('/invites', { email });
  expect(invited.status, JSON.stringify(invited.body)).toBe(201);
  const inviteToken = invited.body.data.url.split('/convite/')[1] as string;

  const signedUp = await apiClient(app.url).post('/auth/sign-up', {
    token: inviteToken,
    name,
    email,
    password: PASSWORD,
  });
  expect(signedUp.status, JSON.stringify(signedUp.body)).toBe(201);

  const session = await signIn(email);

  return { ...session, email, userId: signedUp.body.data.userId as string, inviteToken };
}

const inviteRowByToken = async (token: string) => {
  const [row] = await db
    .select({ acceptedAt: invite.acceptedAt, deletedAt: invite.deletedAt })
    .from(invite)
    .where(eq(invite.tokenHash, hashToken(token)));

  return row;
};

async function mintCompanyInviteToken(companyId: string, email: string) {
  const { token, tokenHash } = createToken();
  await db.insert(invite).values({
    email,
    tokenHash,
    companyId,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });

  return token;
}

const expireInvite = (token: string) =>
  db
    .update(invite)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(invite.tokenHash, hashToken(token)));

const firmIdOf = async (api: Api) => {
  const res = await api.get('/auth/me');
  expect(res.status, JSON.stringify(res.body)).toBe(200);

  return res.body.data.accountingFirm.id as string;
};

describe('autenticação nas rotas de Contabilidade (401 anônimo)', () => {
  it('todas as rotas com escopo exigem sessão', async () => {
    const anon = apiClient(app.url);

    for (const res of await Promise.all([
      anon.get('/auth/me'),
      anon.patch('/auth/device', { deviceId: 'd', platform: 'ios' }),
      anon.post('/invites', { email: 'x@example.com' }),
      anon.get('/invites'),
      anon.delete(`/invites/${GHOST_ID}`),
      anon.get('/accountants'),
      anon.delete(`/accountants/${GHOST_ID}`),
      anon.get('/accounting-firm'),
      anon.patch('/accounting-firm', { name: 'Nova' }),
      anon.get('/accounting-firm/device-stats'),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('cadastro público de Contabilidade (POST /auth/register e alias /public-signup)', () => {
  it('happy path: 201 {userId}, cookie de sessão e firma provisionada no banco', async () => {
    const email = uniqueEmail('dona');
    const res = await apiClient(app.url).post('/auth/register', {
      firmName: 'Provisionada Contabilidade',
      userName: 'Dona',
      email,
      password: PASSWORD,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({ data: { userId: expect.any(String) } });
    const cookie = cookieOf(res.headers);
    expect(cookie).toContain('session_token');

    const [account] = await db
      .select({
        id: authUser.id,
        emailVerified: authUser.emailVerified,
        termsAcceptedAt: authUser.termsAcceptedAt,
      })
      .from(authUser)
      .where(eq(authUser.email, email));
    expect(account.id).toBe(res.body.data.userId);
    expect(account.emailVerified).toBe(true);
    expect(account.termsAcceptedAt).not.toBeNull();

    const [member] = await db
      .select({ owner: accountant.owner, accountingFirmId: accountant.accountingFirmId })
      .from(accountant)
      .where(eq(accountant.authUserId, account.id));
    expect(member.owner).toBe(true);

    const [firmRow] = await db
      .select({ name: accountingFirm.name })
      .from(accountingFirm)
      .where(eq(accountingFirm.id, member.accountingFirmId));
    expect(firmRow.name).toBe('Provisionada Contabilidade');

    const [sub] = await db
      .select({
        planName: subscription.planName,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
      })
      .from(subscription)
      .where(eq(subscription.accountingFirmId, member.accountingFirmId));
    expect(sub.planName).toBe('trial');
    expect(sub.status).toBe('trialing');
    expect(sub.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());

    const me = await apiClient(app.url, { cookie }).get('/auth/me');
    expect(me.status).toBe(200);
  });

  it('o alias /public-signup provisiona do mesmo jeito', async () => {
    const email = uniqueEmail('alias');
    const res = await apiClient(app.url).post('/public-signup', {
      firmName: 'Via Alias',
      userName: 'Dona Alias',
      email,
      password: PASSWORD,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.userId).toBeDefined();
    expect(cookieOf(res.headers)).toContain('session_token');

    const rows = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, email));
    expect(rows).toHaveLength(1);
  });

  it('email duplicado → 422 SIGNUP_REJECTED cego (mesmo com caixa diferente), sem firma nova', async () => {
    const taken = uniqueEmail('tomado');
    const first = await apiClient(app.url).post('/auth/register', {
      firmName: 'Primeira',
      userName: 'Primeira',
      email: taken,
      password: PASSWORD,
    });
    expect(first.status).toBe(201);
    const firmsBefore = (await db.select({ id: accountingFirm.id }).from(accountingFirm)).length;

    for (const email of [taken, taken.toUpperCase()]) {
      const res = await apiClient(app.url).post('/auth/register', {
        firmName: 'Clonada',
        userName: 'Clonada',
        email,
        password: PASSWORD,
      });
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        code: 'SIGNUP_REJECTED',
        message: 'Não foi possível criar a conta com esses dados. Verifique e tente novamente.',
      });
    }

    const firmsAfter = (await db.select({ id: accountingFirm.id }).from(accountingFirm)).length;
    expect(firmsAfter).toBe(firmsBefore);
  });

  it('validação: corpo incompleto, email inválido e senha curta → 422 com issues', async () => {
    const anon = apiClient(app.url);
    const valid = {
      firmName: 'Valida',
      userName: 'Valida',
      email: uniqueEmail('valida'),
      password: PASSWORD,
    };

    for (const body of [
      {},
      { ...valid, email: 'nao-e-email' },
      { ...valid, password: 'curta' },
      { ...valid, firmName: '  ' },
    ]) {
      const res = await anon.post('/auth/register', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });
});

describe('hook x-internal-signup (POST /api/auth/sign-up/email direto)', () => {
  it('sem o header o cadastro aberto é bloqueado e nenhuma conta nasce', async () => {
    const email = uniqueEmail('bloqueada');
    const res = await rawPost('/api/auth/sign-up/email', {
      name: 'Intrusa',
      email,
      password: PASSWORD,
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      message: 'Cadastro aberto não existe neste produto. Use o link de convite.',
    });

    expect(
      await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, email)),
    ).toEqual([]);
  });

  /* O header só é posto pelo `BetterAuthAdapter`, numa chamada em processo; vindo de fora é
   * forjado. O mount o remove antes do handler, então o hook recusa como recusaria qualquer
   * cadastro aberto — e o email continua livre para o dono. */
  it('header forjado não atravessa o hook: sem conta e sem email ocupado', async () => {
    const email = uniqueEmail('forjada');
    const res = await rawPost(
      '/api/auth/sign-up/email',
      { name: 'Forjada', email, password: PASSWORD },
      { 'x-internal-signup': 'true' },
    );

    expect(res.status).toBe(404);
    expect(cookieOf(res.headers)).not.toContain('session_token');

    const rows = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, email));
    expect(rows, 'nenhuma conta pode nascer do header forjado').toHaveLength(0);

    /* A grilagem do email morre junto: quem é dono dele ainda consegue se cadastrar. */
    const legitimate = await apiClient(app.url).post('/auth/register', {
      firmName: 'Tentativa',
      userName: 'Tentativa',
      email,
      password: PASSWORD,
    });
    expect(legitimate.status, JSON.stringify(legitimate.body)).toBe(201);
  });
});

describe('GET /auth/me', () => {
  let firm: Awaited<ReturnType<typeof registerFirm>>;

  beforeAll(async () => {
    firm = await registerFirm(app.url, 'Contabilidade do Me');
  });

  it('dona no trial: contador, firma, plano com capabilities e assinatura', async () => {
    const res = await firm.api.get('/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.data.accountant).toEqual({
      id: expect.any(String),
      name: 'Tester',
      email: firm.email,
      owner: true,
    });
    expect(res.body.data.accountingFirm).toMatchObject({
      id: expect.any(String),
      name: firm.firmName,
      logoUrl: null,
      contactEmail: null,
      plan: {
        name: 'trial',
        companyCap: 15,
        capabilities: ['branding', 'reminderTuning', 'periodZip'],
      },
    });
    expect(res.body.data.accountingFirm.subscription).toEqual({
      status: 'trialing',
      planName: 'trial',
      cycle: 'monthly',
      trialEndsAt: expect.any(String),
      priceOverride: null,
    });
  });

  it('membro convidado vê owner:false na mesma firma', async () => {
    const member = await addMember(firm.api);
    const res = await member.api.get('/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.data.accountant.owner).toBe(false);
    expect(res.body.data.accountingFirm.name).toBe(firm.firmName);
  });
});

describe('PATCH /auth/device', () => {
  let firm: Awaited<ReturnType<typeof registerFirm>>;

  beforeAll(async () => {
    firm = await registerFirm(app.url, 'Contabilidade dos Devices');
  });

  const deviceRows = (userId: string) =>
    db
      .select({
        deviceId: userDevice.deviceId,
        platform: userDevice.platform,
        installed: userDevice.installed,
      })
      .from(userDevice)
      .where(eq(userDevice.userId, userId));

  it('registra o device: 204 sem corpo e linha no banco', async () => {
    const res = await firm.api.patch('/auth/device', {
      deviceId: 'device-1',
      platform: 'ios',
      installed: true,
    });

    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expect(await deviceRows(firm.userId)).toEqual([
      { deviceId: 'device-1', platform: 'ios', installed: true },
    ]);
  });

  it('upsert pelo par (user, deviceId) — e `installed` omitido RESETA para false', async () => {
    const res = await firm.api.patch('/auth/device', { deviceId: 'device-1', platform: 'desktop' });

    expect(res.status).toBe(204);
    expect(await deviceRows(firm.userId)).toEqual([
      { deviceId: 'device-1', platform: 'desktop', installed: false },
    ]);
  });

  it('validação: platform fora do enum e deviceId vazio → 422', async () => {
    for (const body of [
      { deviceId: 'device-2', platform: 'windows' },
      { deviceId: '', platform: 'ios' },
      {},
    ]) {
      const res = await firm.api.patch('/auth/device', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('convite de Contador (POST /invites, GET /invites/:token, POST /auth/sign-up)', () => {
  let firm: Awaited<ReturnType<typeof registerFirm>>;
  let guestEmail: string;
  let guestToken: string;

  beforeAll(async () => {
    firm = await registerFirm(app.url, 'Contabilidade das Convidadas');
    guestEmail = uniqueEmail('convidada');
  });

  it('dono cria o convite: 201 {id,email,url} com token no link, sem rastro em message', async () => {
    const res = await firm.api.post('/invites', { email: guestEmail });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      email: guestEmail,
      url: expect.stringContaining('/convite/'),
    });
    guestToken = res.body.data.url.split('/convite/')[1];
    expect(guestToken.length).toBeGreaterThan(20);

    expect(
      await db.select({ id: message.id }).from(message).where(eq(message.recipient, guestEmail)),
    ).toEqual([]);
  });

  it('preview público do convite de Contador', async () => {
    const res = await apiClient(app.url).get(`/invites/${guestToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      email: guestEmail,
      invitedBy: firm.firmName,
      companyName: null,
      target: 'accounting_firm',
    });
  });

  it('convite pendente duplicado → 409 INVITE_ALREADY_PENDING (case-insensitive)', async () => {
    for (const email of [guestEmail, guestEmail.toUpperCase()]) {
      const res = await firm.api.post('/invites', { email });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVITE_ALREADY_PENDING');
    }
  });

  it('convidar email que já tem conta → 409 EMAIL_ALREADY_REGISTERED', async () => {
    const res = await firm.api.post('/invites', { email: firm.email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('sign-up com email diferente do convidado → 422 INVITE_EMAIL_MISMATCH sem queimar', async () => {
    const res = await apiClient(app.url).post('/auth/sign-up', {
      token: guestToken,
      name: 'Outra',
      email: uniqueEmail('outra'),
      password: PASSWORD,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVITE_EMAIL_MISMATCH');
    expect((await inviteRowByToken(guestToken)).acceptedAt).toBeNull();
  });

  it('happy path do sign-up: queima o convite, cria Contador não-dona e NÃO devolve cookie', async () => {
    const res = await apiClient(app.url).post('/auth/sign-up', {
      token: guestToken,
      name: 'Convidada',
      email: guestEmail,
      password: PASSWORD,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({ data: { userId: expect.any(String) } });
    expect(res.headers.getSetCookie()).toEqual([]);

    expect((await inviteRowByToken(guestToken)).acceptedAt).not.toBeNull();

    const [account] = await db
      .select({ emailVerified: authUser.emailVerified, termsAcceptedAt: authUser.termsAcceptedAt })
      .from(authUser)
      .where(eq(authUser.email, guestEmail));
    expect(account.emailVerified).toBe(true);
    expect(account.termsAcceptedAt).not.toBeNull();

    const [row] = await db
      .select({ owner: accountant.owner })
      .from(accountant)
      .where(eq(accountant.authUserId, res.body.data.userId));
    expect(row.owner).toBe(false);

    const session = await signIn(guestEmail);
    const me = await session.api.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.accountant.owner).toBe(false);
  });

  it('token aceito não serve de novo: sign-up e preview → 409 INVITE_ALREADY_ACCEPTED', async () => {
    const again = await apiClient(app.url).post('/auth/sign-up', {
      token: guestToken,
      name: 'Convidada',
      email: guestEmail,
      password: PASSWORD,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');

    const preview = await apiClient(app.url).get(`/invites/${guestToken}`);
    expect(preview.status).toBe(409);
    expect(preview.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');
  });

  it('membro não convida → 403 ONLY_OWNER_CAN_INVITE', async () => {
    const member = await addMember(firm.api);
    const res = await member.api.post('/invites', { email: uniqueEmail('negada') });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONLY_OWNER_CAN_INVITE');
  });

  /* Bug congelado: o branch 409 EMAIL_ALREADY_REGISTERED do sign-up é código morto. Com
   * `asResponse: true` o better-auth devolve o erro de duplicidade como Response 4xx (não
   * lança), o adapter embrulha em success com userId VAZIO e o insert de accountant estoura
   * no Postgres (`invalid input syntax for type uuid: ""`) → 500 INTERNAL_ERROR. O rollback
   * da transação ao menos preserva o convite (não queima). */
  it('bug congelado: email convidado que ganhou conta no meio do caminho → 500, sem queimar', async () => {
    const lateEmail = uniqueEmail('atrasada');
    const invited = await firm.api.post('/invites', { email: lateEmail });
    expect(invited.status).toBe(201);
    const token = invited.body.data.url.split('/convite/')[1];

    const registered = await apiClient(app.url).post('/auth/register', {
      firmName: 'Firma da Atrasada',
      userName: 'Atrasada',
      email: lateEmail,
      password: PASSWORD,
    });
    expect(registered.status).toBe(201);

    const res = await apiClient(app.url).post('/auth/sign-up', {
      token,
      name: 'Atrasada',
      email: lateEmail,
      password: PASSWORD,
    });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect((await inviteRowByToken(token)).acceptedAt).toBeNull();

    const accounts = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, lateEmail));
    expect(accounts, 'a conta original sobrevive intacta').toHaveLength(1);
  });

  it('convite de Empresa neste endpoint → 422 INVITE_TARGET_UNSUPPORTED; preview mostra target company', async () => {
    const seed = contactBody();
    const created = await createCompany(firm.api, { name: 'Empresa do Convite', contact: seed });
    const token = await mintCompanyInviteToken(created.id, seed.email);

    const preview = await apiClient(app.url).get(`/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toEqual({
      email: seed.email,
      invitedBy: firm.firmName,
      companyName: 'Empresa do Convite',
      target: 'company',
    });

    const res = await apiClient(app.url).post('/auth/sign-up', {
      token,
      name: seed.name,
      email: seed.email,
      password: PASSWORD,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVITE_TARGET_UNSUPPORTED');
  });

  it('token desconhecido → 404 e expirado → 410, no sign-up e no preview', async () => {
    const anon = apiClient(app.url);

    const unknownSignUp = await anon.post('/auth/sign-up', {
      token: 'token-que-nao-existe',
      name: 'Ninguém',
      email: uniqueEmail('ninguem'),
      password: PASSWORD,
    });
    expect(unknownSignUp.status).toBe(404);
    expect(unknownSignUp.body.error.code).toBe('INVITE_NOT_FOUND');

    const unknownPreview = await anon.get('/invites/token-que-nao-existe');
    expect(unknownPreview.status).toBe(404);
    expect(unknownPreview.body.error.code).toBe('INVITE_NOT_FOUND');

    const expiredEmail = uniqueEmail('vencida');
    const invited = await firm.api.post('/invites', { email: expiredEmail });
    expect(invited.status).toBe(201);
    const expiredToken = invited.body.data.url.split('/convite/')[1];
    await expireInvite(expiredToken);

    const expiredSignUp = await anon.post('/auth/sign-up', {
      token: expiredToken,
      name: 'Vencida',
      email: expiredEmail,
      password: PASSWORD,
    });
    expect(expiredSignUp.status).toBe(410);
    expect(expiredSignUp.body.error.code).toBe('INVITE_EXPIRED');

    const expiredPreview = await anon.get(`/invites/${expiredToken}`);
    expect(expiredPreview.status).toBe(410);
    expect(expiredPreview.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('validação: convite com email inválido e sign-up incompleto → 422', async () => {
    const badInvite = await firm.api.post('/invites', { email: 'nao-e-email' });
    expect(badInvite.status).toBe(422);
    expect(badInvite.body.error.code).toBe('VALIDATION_ERROR');

    const anon = apiClient(app.url);
    for (const body of [
      {},
      { token: 'abc', name: 'X', email: uniqueEmail('curta'), password: 'curta' },
      { token: 'abc', name: 'X', email: 'nao-e-email', password: PASSWORD },
      { name: 'X', email: uniqueEmail('semtoken'), password: PASSWORD },
    ]) {
      const res = await anon.post('/auth/sign-up', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('convites pendentes da equipe (GET /invites, DELETE /invites/:id)', () => {
  let firm: Awaited<ReturnType<typeof registerFirm>>;
  let member: Awaited<ReturnType<typeof addMember>>;
  let pendingId: string;
  let pendingToken: string;

  beforeAll(async () => {
    firm = await registerFirm(app.url, 'Contabilidade dos Pendentes');
    member = await addMember(firm.api);
  });

  it('lista só os pendentes vivos: aceito some, vencido some', async () => {
    const pendingEmail = uniqueEmail('pendente');
    const created = await firm.api.post('/invites', { email: pendingEmail });
    expect(created.status).toBe(201);
    pendingId = created.body.data.id;
    pendingToken = created.body.data.url.split('/convite/')[1];

    const expired = await firm.api.post('/invites', { email: uniqueEmail('vencendo') });
    expect(expired.status).toBe(201);
    await expireInvite(expired.body.data.url.split('/convite/')[1]);

    const res = await firm.api.get('/invites');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: pendingId, email: pendingEmail, expiresAt: expect.any(String) },
    ]);
    expect(Date.parse(res.body.data[0].expiresAt)).toBeGreaterThan(Date.now());
  });

  it('membro lê a lista normalmente (só revogar é do dono)', async () => {
    const res = await member.api.get('/invites');
    expect(res.status).toBe(200);
    expect(res.body.data.map((row: any) => row.id)).toEqual([pendingId]);
  });

  it('membro não revoga → 403 ONLY_OWNER_CAN_MANAGE_TEAM', async () => {
    const res = await member.api.delete(`/invites/${pendingId}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONLY_OWNER_CAN_MANAGE_TEAM');
  });

  it('dono revoga: o token morre no preview e no sign-up', async () => {
    const res = await firm.api.delete(`/invites/${pendingId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { revoked: true } });

    expect((await firm.api.get('/invites')).body.data).toEqual([]);

    const preview = await apiClient(app.url).get(`/invites/${pendingToken}`);
    expect(preview.status).toBe(404);
    expect(preview.body.error.code).toBe('INVITE_NOT_FOUND');

    const signUp = await apiClient(app.url).post('/auth/sign-up', {
      token: pendingToken,
      name: 'Revogada',
      email: uniqueEmail('revogada'),
      password: PASSWORD,
    });
    expect(signUp.status).toBe(404);
    expect(signUp.body.error.code).toBe('INVITE_NOT_FOUND');
  });

  it('revogar de novo, convite fantasma e id mal formado', async () => {
    const again = await firm.api.delete(`/invites/${pendingId}`);
    expect(again.status).toBe(404);
    expect(again.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Convite não encontrado ou já usado.',
    });

    const ghost = await firm.api.delete(`/invites/${GHOST_ID}`);
    expect(ghost.status).toBe(404);

    const malformed = await firm.api.delete('/invites/nao-e-uuid');
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('equipe (GET /accountants, DELETE /accountants/:id)', () => {
  let firm: Awaited<ReturnType<typeof registerFirm>>;
  let member: Awaited<ReturnType<typeof addMember>>;
  let ownerAccountantId: string;
  let memberAccountantId: string;

  beforeAll(async () => {
    firm = await registerFirm(app.url, 'Contabilidade da Equipe');
    member = await addMember(firm.api, 'Membro da Equipe');
  });

  it('lista a equipe com o dono primeiro; membro também lê', async () => {
    const res = await firm.api.get('/accountants');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ name: 'Tester', email: firm.email, owner: true });
    expect(res.body.data[1]).toMatchObject({
      name: 'Membro da Equipe',
      email: member.email,
      owner: false,
    });
    ownerAccountantId = res.body.data[0].id;
    memberAccountantId = res.body.data[1].id;

    const viaMember = await member.api.get('/accountants');
    expect(viaMember.status).toBe(200);
    expect(viaMember.body.data).toHaveLength(2);
  });

  it('membro não remove ninguém → 403 ONLY_OWNER_CAN_MANAGE_TEAM', async () => {
    const res = await member.api.delete(`/accountants/${ownerAccountantId}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONLY_OWNER_CAN_MANAGE_TEAM');
  });

  it('o dono não sai: → 422 CANNOT_REMOVE_OWNER', async () => {
    const res = await firm.api.delete(`/accountants/${ownerAccountantId}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CANNOT_REMOVE_OWNER');
  });

  it('fantasma → 404 e id mal formado → 422', async () => {
    const ghost = await firm.api.delete(`/accountants/${GHOST_ID}`);
    expect(ghost.status).toBe(404);
    expect(ghost.body.error).toEqual({ code: 'NOT_FOUND', message: 'Contador não encontrado.' });

    const malformed = await firm.api.delete('/accountants/nao-e-uuid');
    expect(malformed.status).toBe(422);
  });

  it('remover membro apaga o user e derruba a sessão na hora', async () => {
    const res = await firm.api.delete(`/accountants/${memberAccountantId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { removed: true } });

    expect(
      await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, member.email)),
    ).toEqual([]);

    const dead = await member.api.get('/auth/me');
    expect(dead.status).toBe(401);
    expect(dead.body.error.code).toBe('UNAUTHENTICATED');

    const list = await firm.api.get('/accountants');
    expect(list.body.data).toHaveLength(1);
  });
});

describe('Contabilidade (GET/PATCH /accounting-firm, device-stats)', () => {
  let firm: Awaited<ReturnType<typeof registerFirm>>;
  let member: Awaited<ReturnType<typeof addMember>>;
  let firmId: string;

  beforeAll(async () => {
    firm = await registerFirm(app.url, 'Contabilidade das Configurações');
    member = await addMember(firm.api);
    firmId = await firmIdOf(firm.api);
  });

  it('GET devolve a firma com defaults de lembrete e a assinatura trial', async () => {
    const res = await firm.api.get('/accounting-firm');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: firmId,
      name: firm.firmName,
      reminderMax: 2,
      reminderDueSoonDays: 3,
      reminderGapDays: 3,
      logoUrl: null,
      contactEmail: null,
      subscription: {
        id: expect.any(String),
        planName: 'trial',
        status: 'trialing',
        trialEndsAt: expect.any(String),
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
    });

    const viaMember = await member.api.get('/accounting-firm');
    expect(viaMember.status).toBe(200);
  });

  it('membro não edita a firma → 403 ONLY_OWNER_CAN_MANAGE_TEAM', async () => {
    const res = await member.api.patch('/accounting-firm', { name: 'Golpe' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONLY_OWNER_CAN_MANAGE_TEAM');
  });

  it('dono edita nome, logo e email de contato; logo vazio vira null', async () => {
    const res = await firm.api.patch('/accounting-firm', {
      name: 'Renomeada',
      logoUrl: 'https://cdn.example.com/logo.png',
      contactEmail: 'contato@example.com',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Renomeada',
      logoUrl: 'https://cdn.example.com/logo.png',
      contactEmail: 'contato@example.com',
    });

    const cleared = await firm.api.patch('/accounting-firm', { logoUrl: '', contactEmail: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({ logoUrl: null, contactEmail: null });
  });

  it('trial ajusta a cadência de lembretes (capability liberada no teste)', async () => {
    const res = await firm.api.patch('/accounting-firm', {
      reminderMax: 5,
      reminderDueSoonDays: 7,
      reminderGapDays: 2,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      reminderMax: 5,
      reminderDueSoonDays: 7,
      reminderGapDays: 2,
    });
  });

  it('no Essencial o gate fecha: lembretes → 402 PLAN_CAPABILITY_REQUIRED; o resto segue', async () => {
    await db
      .update(subscription)
      .set({ planName: 'essencial' })
      .where(eq(subscription.accountingFirmId, firmId));

    const gated = await firm.api.patch('/accounting-firm', { reminderMax: 1 });
    expect(gated.status).toBe(402);
    expect(gated.body.error).toEqual({
      code: 'PLAN_CAPABILITY_REQUIRED',
      message: 'Este recurso está disponível a partir do plano Profissional.',
      details: { capability: 'reminderTuning', requiredPlan: 'profissional' },
    });

    const allowed = await firm.api.patch('/accounting-firm', { name: 'Essencial Renomeada' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.name).toBe('Essencial Renomeada');

    await db
      .update(subscription)
      .set({ planName: 'trial' })
      .where(eq(subscription.accountingFirmId, firmId));
  });

  it('validação: corpo vazio, logo http e gap fora da faixa → 422', async () => {
    for (const body of [
      {},
      { logoUrl: 'http://inseguro.example.com/logo.png' },
      { reminderGapDays: 0 },
      { contactEmail: 'nao-e-email' },
    ]) {
      const res = await firm.api.patch('/accounting-firm', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('device-stats: começa zerado e agrega os devices da equipe por plataforma', async () => {
    const zeroAudience = {
      total: 0,
      installed: 0,
      byPlatform: {
        ios: { total: 0, installed: 0 },
        android: { total: 0, installed: 0 },
        desktop: { total: 0, installed: 0 },
        other: { total: 0, installed: 0 },
      },
    };

    const before = await firm.api.get('/accounting-firm/device-stats');
    expect(before.status).toBe(200);
    expect(before.body.data).toEqual({ contacts: zeroAudience, accountants: zeroAudience });

    const ownerDevice = await firm.api.patch('/auth/device', {
      deviceId: 'stats-1',
      platform: 'ios',
      installed: true,
    });
    expect(ownerDevice.status).toBe(204);
    const memberDevice = await member.api.patch('/auth/device', {
      deviceId: 'stats-2',
      platform: 'android',
    });
    expect(memberDevice.status).toBe(204);

    const after = await firm.api.get('/accounting-firm/device-stats');
    expect(after.body.data.contacts).toEqual(zeroAudience);
    expect(after.body.data.accountants).toEqual({
      total: 2,
      installed: 1,
      byPlatform: {
        ios: { total: 1, installed: 1 },
        android: { total: 1, installed: 0 },
        desktop: { total: 0, installed: 0 },
        other: { total: 0, installed: 0 },
      },
    });
  });
});

describe('isolamento entre firmas', () => {
  let firmA: Awaited<ReturnType<typeof registerFirm>>;
  let firmB: Awaited<ReturnType<typeof registerFirm>>;

  beforeAll(async () => {
    [firmA, firmB] = await Promise.all([registerFirm(app.url), registerFirm(app.url)]);
  });

  it('convite pendente é por firma: as duas convidam o mesmo email', async () => {
    const sharedEmail = uniqueEmail('compartilhada');

    const inA = await firmA.api.post('/invites', { email: sharedEmail });
    expect(inA.status).toBe(201);
    const inB = await firmB.api.post('/invites', { email: sharedEmail });
    expect(inB.status).toBe(201);

    const listB = await firmB.api.get('/invites');
    expect(listB.body.data.map((row: any) => row.id)).toEqual([inB.body.data.id]);

    const crossRevoke = await firmB.api.delete(`/invites/${inA.body.data.id}`);
    expect(crossRevoke.status).toBe(404);

    const listA = await firmA.api.get('/invites');
    expect(listA.body.data.map((row: any) => row.id)).toEqual([inA.body.data.id]);
  });

  it('equipe alheia é invisível: lista própria e remoção cross-firm → 404', async () => {
    const memberA = await addMember(firmA.api);

    const listB = await firmB.api.get('/accountants');
    expect(listB.body.data).toHaveLength(1);
    expect(listB.body.data[0].email).toBe(firmB.email);

    const listA = await firmA.api.get('/accountants');
    const memberRow = listA.body.data.find((row: any) => row.email === memberA.email);
    expect(memberRow).toBeDefined();

    const crossRemove = await firmB.api.delete(`/accountants/${memberRow.id}`);
    expect(crossRemove.status).toBe(404);

    const stillAlive = await memberA.api.get('/auth/me');
    expect(stillAlive.status).toBe(200);
  });
});

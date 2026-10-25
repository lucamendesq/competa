import { desc, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import {
  company,
  contact,
  document,
  invite,
  message,
  pushSubscription,
  request,
  uploadLink,
  user as authUser,
  verification,
} from '../src/infra/database/schema/index.js';
import {
  createToken,
  hashToken,
  recoveryFingerprint,
  signRecoveryToken,
} from '../src/lib/token.js';
import {
  apiClient,
  contactBody,
  createCompany,
  createTemplate,
  documentTypeIds,
  registerFirm,
  uniqueIp,
  type Api,
} from './support/fixtures.js';

const REFERENCE_MONTH = '2026-09';
const PASSWORD = 'senha-do-responsavel-1';
const GHOST_ID = '018f0000-0000-7000-8000-00000000dead';

let pushSeq = 0;
const pushBody = () => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/inscricao-${++pushSeq}`,
  keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
});

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const CSV_CONTENT = 'data;valor\n2026-09-01;100,00\n';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

type CompanyBox = {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  requestId: string;
  uploadToken: string;
};

/** O fan-out da competência devolve o token do Link de Upload em claro — a porta de
 *  entrada de todo o módulo. */
async function openFirmWithCompanies(
  specs: Array<{ name: string; contactName?: string; contactEmail?: string }>,
  premadeFirm?: Awaited<ReturnType<typeof registerFirm>>,
) {
  const firm = premadeFirm ?? (await registerFirm(app.url));
  const [documentTypeId] = await documentTypeIds(firm.api, 1);
  const templateId = await createTemplate(firm.api, [{ documentTypeId, dueDay: 5 }]);

  const boxes: Record<string, CompanyBox> = {};
  for (const spec of specs) {
    const seed = contactBody(spec.contactName);
    const contactEmail = spec.contactEmail ?? seed.email;
    const created = await createCompany(firm.api, {
      name: spec.name,
      checklistTemplateId: templateId,
      contact: { name: seed.name, email: contactEmail },
    });
    boxes[spec.name] = {
      id: created.id as string,
      name: spec.name,
      contactName: seed.name,
      contactEmail,
      requestId: '',
      uploadToken: '',
    };
  }

  const opened = await firm.api.post('/periods', { referenceMonth: REFERENCE_MONTH });
  expect(opened.status, JSON.stringify(opened.body)).toBe(201);
  for (const row of opened.body.data.requests) {
    boxes[row.companyName].requestId = row.id;
    boxes[row.companyName].uploadToken = row.uploadUrl.split('/envio/')[1];
  }

  return { firm, periodId: opened.body.data.id as string, boxes };
}

const activate = (uploadToken: string, body: Record<string, unknown> = {}) =>
  apiClient(app.url).post(`/upload/${uploadToken}/access`, body);

const rawRequest = (
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown; redirect?: RequestRedirect } = {},
) =>
  fetch(`${app.url}${path}`, {
    method,
    redirect: opts.redirect ?? 'follow',
    headers: {
      'x-forwarded-for': uniqueIp(),
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

async function signIn(email: string, password = PASSWORD) {
  const res = await rawRequest('POST', '/api/auth/sign-in/email', { body: { email, password } });
  expect(res.status, await res.clone().text()).toBe(200);
  const cookie = cookieOf(res);
  expect(cookie).not.toBe('');

  return { api: apiClient(app.url, { cookie }), cookie };
}

/** O caminho real do Responsável: ativar pelo Link NÃO dá sessão nem senha — ela só nasce
 *  quando o magic link que foi para a caixa dele é consumido. */
async function contactSession(uploadToken: string, email: string) {
  const activated = await activate(uploadToken);
  expect(activated.status, JSON.stringify(activated.body)).toBe(201);

  const token = await magicLinkTokenFor(email);
  expect(token, `magic link para ${email}`).toBeDefined();

  const verify = await rawRequest(
    'GET',
    `/api/auth/magic-link/verify?token=${token}&callbackURL=/entrou`,
    { redirect: 'manual' },
  );
  expect(verify.status, await verify.clone().text()).toBe(302);
  const cookie = cookieOf(verify);
  expect(cookie).toContain('session_token');

  return { api: apiClient(app.url, { cookie }), cookie };
}

async function mintInvite(
  target: { companyId?: string; accountingFirmId?: string },
  email: string,
  opts: { expiresAt?: Date } = {},
) {
  const { token, tokenHash } = createToken();
  await db.insert(invite).values({
    email,
    tokenHash,
    companyId: target.companyId ?? null,
    accountingFirmId: target.accountingFirmId ?? null,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 86_400_000),
  });

  return token;
}

const acceptInvite = (token: string, body: Record<string, unknown>) =>
  apiClient(app.url).post(`/invites/${token}/contact-account`, body);

const inviteRow = async (token: string) => {
  const [row] = await db
    .select({ acceptedAt: invite.acceptedAt })
    .from(invite)
    .where(eq(invite.tokenHash, hashToken(token)));

  return row;
};

const contactOfCompany = async (companyId: string) => {
  const [row] = await db
    .select({ id: contact.id, authUserId: contact.authUserId })
    .from(contact)
    .where(eq(contact.companyId, companyId));
  expect(row).toBeDefined();

  return row;
};

const magicLinkTokenFor = async (email: string) => {
  const rows = await db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(like(verification.value, `%${email}%`))
    .orderBy(desc(verification.createdAt));

  return rows[0]?.identifier;
};

/** O LocalStorage assina a URL com env.PORT (3000); em teste o app sobe em porta efêmera —
 *  trocar só a origem preserva a assinatura, que cobre caminho e query. */
async function putFile(presignUrl: string, content: Buffer | string) {
  const signed = new URL(presignUrl);
  const origin = new URL(app.url);
  signed.protocol = origin.protocol;
  signed.host = origin.host;

  const res = await fetch(signed, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'x-forwarded-for': uniqueIp() },
    body: typeof content === 'string' ? content : new Uint8Array(content),
  });
  expect(res.status, await res.clone().text()).toBe(200);
}

async function uploadDocument(
  api: Api,
  requestId: string,
  file: { fileName: string; content: Buffer | string; contentType: string },
  requestItemId?: string,
) {
  const sizeBytes = Buffer.byteLength(file.content);
  const presigned = await api.post('/my/documents', {
    requestId,
    ...(requestItemId ? { requestItemId } : {}),
    files: [{ fileName: file.fileName, contentType: file.contentType, sizeBytes }],
  });
  expect(presigned.status, JSON.stringify(presigned.body)).toBe(201);
  const [slot] = presigned.body.data.files;
  expect(slot.accepted, slot.reason).toBe(true);

  await putFile(slot.uploadUrl, file.content);

  const confirmed = await api.post('/my/documents/confirm', {
    requestId,
    documentIds: [slot.documentId],
  });
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);

  return { documentId: slot.documentId as string, confirmed: confirmed.body.data };
}

describe('autenticação e autorização nas rotas /my', () => {
  it('todas as rotas /my exigem sessão (401 UNAUTHENTICATED)', async () => {
    const anon = apiClient(app.url);

    for (const res of await Promise.all([
      anon.get('/my/profile'),
      anon.get('/my/pending'),
      anon.get('/my/periods'),
      anon.get(`/my/periods/${GHOST_ID}`),
      anon.get(`/my/documents/${GHOST_ID}/content`),
      anon.post('/my/push/subscribe', pushBody()),
      anon.delete('/my/push/subscribe'),
      anon.post('/my/password', { password: PASSWORD }),
      anon.post('/my/documents', { requestId: GHOST_ID, files: [] }),
      anon.post('/my/documents/confirm', { requestId: GHOST_ID, documentIds: [GHOST_ID] }),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('sessão de Contador não é de Responsável: 403 FORBIDDEN', async () => {
    const firm = await registerFirm(app.url);

    const profile = await firm.api.get('/my/profile');
    expect(profile.status).toBe(403);
    expect(profile.body.error.code).toBe('FORBIDDEN');
    expect(profile.body.error.message).toContain('não é de um Responsável');

    const presign = await firm.api.post('/my/documents', { requestId: GHOST_ID, files: [] });
    expect(presign.status).toBe(403);
    expect(presign.body.error.message).toContain('não é de um Responsável');
  });
});

describe('ativação de acesso pelo Link de Upload (POST /upload/:token/access)', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;

  beforeAll(async () => {
    const firm = await registerFirm(app.url);
    fixture = await openFirmWithCompanies(
      [
        { name: 'Ativa' },
        { name: 'SemSenha' },
        { name: 'Revogada' },
        { name: 'Vencida' },
        { name: 'DaContadora', contactEmail: firm.email },
        { name: 'Valida' },
      ],
      firm,
    );
  });

  /* O Link de Upload circula por email encaminhado, histórico e log de proxy: possuí-lo não
   * prova controle da caixa, então ele não pode render credencial. Uma senha no corpo é
   * descartada pelo schema e NÃO autentica. */
  it('senha no corpo é ignorada: nenhuma credencial nasce do Link', async () => {
    const box = fixture.boxes.Ativa;
    const res = await activate(box.uploadToken, { password: PASSWORD, name: 'Nome Ajustado' });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      email: box.contactEmail,
      name: 'Nome Ajustado',
      nextStep: 'check_email',
    });
    expect(res.headers.getSetCookie()).toEqual([]);

    const owner = await contactOfCompany(box.id);
    expect(owner.authUserId).not.toBeNull();

    /* `emailVerified` passa a ser carimbado pelo magic link, que é onde o controle da caixa
     * fica provado — não por quem apresentou o Link. */
    const [account] = await db
      .select({ emailVerified: authUser.emailVerified, termsAcceptedAt: authUser.termsAcceptedAt })
      .from(authUser)
      .where(eq(authUser.email, box.contactEmail));
    expect(account.emailVerified).toBe(false);
    expect(account.termsAcceptedAt).not.toBeNull();

    expect(await magicLinkTokenFor(box.contactEmail)).toBeDefined();

    const signedIn = await rawRequest('POST', '/api/auth/sign-in/email', {
      body: { email: box.contactEmail, password: PASSWORD },
    });
    expect(signedIn.status, 'a senha enviada no Link não pode autenticar').toBe(401);
  });

  it('reativar contato que já tem acesso → 409 CONTACT_ACCESS_ALREADY_EXISTS', async () => {
    const res = await activate(fixture.boxes.Ativa.uploadToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTACT_ACCESS_ALREADY_EXISTS');
  });

  it('sem senha: conta nasce sem sessão e o acesso se completa pelo magic link', async () => {
    const box = fixture.boxes.SemSenha;
    const res = await activate(box.uploadToken, {});

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      email: box.contactEmail,
      name: box.contactName,
      nextStep: 'check_email',
    });
    expect(res.headers.getSetCookie()).toEqual([]);

    const magicToken = await magicLinkTokenFor(box.contactEmail);
    expect(magicToken).toBeDefined();

    const verify = await rawRequest(
      'GET',
      `/api/auth/magic-link/verify?token=${magicToken}&callbackURL=/entrou`,
      { redirect: 'manual' },
    );
    expect(verify.status).toBe(302);
    const cookie = cookieOf(verify);
    expect(cookie).toContain('session_token');

    const api = apiClient(app.url, { cookie });
    const profile = await api.get('/my/profile');
    expect(profile.status).toBe(200);

    /* A ativação apaga a credencial aleatória que o `signUpEmail` exige, então o Responsável
     * chega aqui SEM senha — e é daqui, já com a caixa provada pelo magic link, que ele
     * escolhe a dele. */
    expect(profile.body.data.hasPassword).toBe(false);

    const setPassword = await api.post('/my/password', { password: PASSWORD });
    expect(setPassword.status, JSON.stringify(setPassword.body)).toBe(204);

    const { api: withPassword } = await signIn(box.contactEmail);
    expect((await withPassword.get('/my/profile')).body.data.hasPassword).toBe(true);
  });

  it('token desconhecido → 404 UPLOAD_LINK_INVALID', async () => {
    const res = await activate('token-inexistente');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UPLOAD_LINK_INVALID');
  });

  it('link revogado e link expirado → mesmo 404 UPLOAD_LINK_INVALID', async () => {
    await db
      .update(uploadLink)
      .set({ revoked: true })
      .where(eq(uploadLink.requestId, fixture.boxes.Revogada.requestId));
    const revoked = await activate(fixture.boxes.Revogada.uploadToken);
    expect(revoked.status).toBe(404);
    expect(revoked.body.error.code).toBe('UPLOAD_LINK_INVALID');

    await db
      .update(uploadLink)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(uploadLink.requestId, fixture.boxes.Vencida.requestId));
    const expired = await activate(fixture.boxes.Vencida.uploadToken);
    expect(expired.status).toBe(404);
    expect(expired.body.error.code).toBe('UPLOAD_LINK_INVALID');
  });

  it('email que já tem conta de Contador → 409 EMAIL_ALREADY_REGISTERED, sem vincular', async () => {
    const box = fixture.boxes.DaContadora;
    const res = await activate(box.uploadToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const owner = await contactOfCompany(box.id);
    expect(owner.authUserId).toBeNull();
  });

  it('POST /upload/:token/push grava inscrição que herda a validade do link', async () => {
    const box = fixture.boxes.Valida;
    const body = pushBody();
    const res = await apiClient(app.url).post(`/upload/${box.uploadToken}/push`, body);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ endpoint: body.endpoint });

    const [link] = await db
      .select({ expiresAt: uploadLink.expiresAt })
      .from(uploadLink)
      .where(eq(uploadLink.requestId, box.requestId));
    const [row] = await db
      .select({ expiresAt: pushSubscription.expiresAt })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, body.endpoint));
    expect(row.expiresAt?.getTime()).toBe(link.expiresAt.getTime());
  });

  it('push com endpoint fora da allowlist → 422; com token inválido → 404', async () => {
    const badEndpoint = await apiClient(app.url).post(
      `/upload/${fixture.boxes.Valida.uploadToken}/push`,
      { endpoint: 'https://atacante.example.com/ssrf', keys: { p256dh: 'x', auth: 'y' } },
    );
    expect(badEndpoint.status).toBe(422);
    expect(badEndpoint.body.error.code).toBe('VALIDATION_ERROR');

    const badToken = await apiClient(app.url).post('/upload/token-falso/push', pushBody());
    expect(badToken.status).toBe(404);
    expect(badToken.body.error.code).toBe('UPLOAD_LINK_INVALID');
  });
});

describe('aceite de convite de Responsável (POST /invites/:token/contact-account)', () => {
  let firm: Awaited<ReturnType<typeof registerFirm>>;
  let accountingFirmId: string;
  let companyId: string;
  let guestEmail: string;
  let guestName: string;
  let acceptedToken: string;

  beforeAll(async () => {
    firm = await registerFirm(app.url);
    const seed = contactBody('Convidada');
    guestEmail = seed.email;
    guestName = seed.name;
    const created = await createCompany(firm.api, { name: 'Convidada SA', contact: seed });
    companyId = created.id as string;

    const [row] = await db
      .select({ accountingFirmId: company.accountingFirmId })
      .from(company)
      .where(eq(company.id, companyId));
    accountingFirmId = row.accountingFirmId;
  });

  it('happy path: cria a conta com senha, queima o convite e permite entrar', async () => {
    acceptedToken = await mintInvite({ companyId }, guestEmail);
    const res = await acceptInvite(acceptedToken, { password: PASSWORD });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({ email: guestEmail, name: guestName, nextStep: 'sign_in' });
    expect(res.headers.getSetCookie()).toEqual([]);

    expect((await inviteRow(acceptedToken)).acceptedAt).not.toBeNull();

    const owner = await contactOfCompany(companyId);
    expect(owner.authUserId).not.toBeNull();

    const [account] = await db
      .select({ emailVerified: authUser.emailVerified, termsAcceptedAt: authUser.termsAcceptedAt })
      .from(authUser)
      .where(eq(authUser.email, guestEmail));
    expect(account.emailVerified).toBe(true);
    expect(account.termsAcceptedAt).not.toBeNull();

    const { api } = await signIn(guestEmail);
    const profile = await api.get('/my/profile');
    expect(profile.status).toBe(200);
    expect(profile.body.data.companyName).toBe('Convidada SA');
  });

  it('mesmo convite de novo → 409 INVITE_ALREADY_ACCEPTED', async () => {
    const res = await acceptInvite(acceptedToken, { password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');
  });

  it('contato que já tem acesso → 409 CONTACT_ACCESS_ALREADY_EXISTS sem queimar o convite', async () => {
    const token = await mintInvite({ companyId }, guestEmail);
    const res = await acceptInvite(token, { password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTACT_ACCESS_ALREADY_EXISTS');
    expect((await inviteRow(token)).acceptedAt).toBeNull();
  });

  it('email com conta existente → 409 EMAIL_ALREADY_REGISTERED sem queimar o convite', async () => {
    const created = await createCompany(firm.api, {
      name: 'Da Contadora SA',
      contact: { name: 'Contadora', email: firm.email },
    });
    const token = await mintInvite({ companyId: created.id as string }, firm.email);
    const res = await acceptInvite(token, { password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect((await inviteRow(token)).acceptedAt).toBeNull();
  });

  it('token desconhecido → 404 INVITE_NOT_FOUND', async () => {
    const res = await acceptInvite('token-que-nao-existe', { password: PASSWORD });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVITE_NOT_FOUND');
  });

  it('convite expirado → 410 INVITE_EXPIRED', async () => {
    const token = await mintInvite({ companyId }, contactBody().email, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await acceptInvite(token, { password: PASSWORD });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('convite de Contabilidade neste endpoint → 422 INVITE_TARGET_UNSUPPORTED', async () => {
    const token = await mintInvite({ accountingFirmId }, contactBody().email);
    const res = await acceptInvite(token, { password: PASSWORD });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVITE_TARGET_UNSUPPORTED');
  });

  it('email do convite sem Responsável na Empresa → 404 sem queimar o convite', async () => {
    const token = await mintInvite({ companyId }, 'sem-contato@example.com');
    const res = await acceptInvite(token, { password: PASSWORD });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect((await inviteRow(token)).acceptedAt).toBeNull();
  });

  it('senha curta → 422 VALIDATION_ERROR', async () => {
    const token = await mintInvite({ companyId }, guestEmail);
    const res = await acceptInvite(token, { password: 'curta' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('área logada do Responsável (/my) com vínculo multi-empresa', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let session: { api: Api; cookie: string };
  let stranger: { api: Api; cookie: string };
  let strangerBoxes: Record<string, CompanyBox>;
  let sharedEmail: string;

  beforeAll(async () => {
    sharedEmail = contactBody('Multi').email;
    fixture = await openFirmWithCompanies([
      { name: 'Andorinha', contactEmail: sharedEmail },
      { name: 'Bemtevi', contactEmail: sharedEmail },
    ]);

    session = await contactSession(fixture.boxes.Andorinha.uploadToken, sharedEmail);
    /* Segunda ativação do MESMO email: vincula a Empresa B à conta existente. */
    const second = await activate(fixture.boxes.Bemtevi.uploadToken);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.data.nextStep).toBe('check_email');

    const other = await openFirmWithCompanies([{ name: 'Corvo' }]);
    strangerBoxes = other.boxes;
    stranger = await contactSession(other.boxes.Corvo.uploadToken, other.boxes.Corvo.contactEmail);
  });

  it('GET /my/profile lista todos os vínculos e usa o contato mais antigo como cabeça', async () => {
    const res = await session.api.get('/my/profile');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: fixture.boxes.Andorinha.contactName,
      email: sharedEmail,
      phone: null,
      companyId: fixture.boxes.Andorinha.id,
      companyName: 'Andorinha',
      accountingFirmName: fixture.firm.firmName,
      // ativou pelo Link e entrou pelo magic link: nunca escolheu senha
      hasPassword: false,
    });
    expect(res.body.data.companies.map((row: any) => row.companyName)).toEqual([
      'Andorinha',
      'Bemtevi',
    ]);
  });

  it('GET /my/pending junta os itens das duas Empresas com prazo efetivo', async () => {
    const res = await session.api.get('/my/pending');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((row: any) => row.companyName).sort()).toEqual([
      'Andorinha',
      'Bemtevi',
    ]);

    const first = res.body.data[0];
    expect(first).toMatchObject({
      referenceMonth: `${REFERENCE_MONTH}-01`,
      periodId: fixture.periodId,
    });
    expect(first.item).toMatchObject({
      status: 'pending',
      dueDate: '2026-10-05',
      rejections: [],
    });
    expect(Array.isArray(first.item.acceptedFormats)).toBe(true);
  });

  it('GET /my/periods pagina com meta e devolve uma linha por Solicitação', async () => {
    const res = await session.api.get('/my/periods');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, perPage: 20, total: 2 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      periodId: fixture.periodId,
      referenceMonth: `${REFERENCE_MONTH}-01`,
      periodStatus: 'open',
      requestStatus: 'open',
      dueDate: null,
      itemCount: 1,
      pendingCount: 1,
      deliveredCount: 0,
    });

    const paged = await session.api.get('/my/periods?page=2&perPage=1');
    expect(paged.body.meta).toEqual({ page: 2, perPage: 1, total: 2 });
    expect(paged.body.data).toHaveLength(1);
  });

  it('paginação mal formada em /my/periods → 422 VALIDATION_ERROR', async () => {
    const res = await session.api.get('/my/periods?page=abc');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /my/periods/:id abre na primeira Empresa e troca via ?companyId', async () => {
    const res = await session.api.get(`/my/periods/${fixture.periodId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      periodId: fixture.periodId,
      companyName: 'Andorinha',
      requestStatus: 'open',
    });
    expect(res.body.data.companies.map((row: any) => row.name)).toEqual(['Andorinha', 'Bemtevi']);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({ status: 'pending', documents: [] });
    expect(res.body.data.extraDocuments).toEqual([]);

    const other = await session.api.get(
      `/my/periods/${fixture.periodId}?companyId=${fixture.boxes.Bemtevi.id}`,
    );
    expect(other.status).toBe(200);
    expect(other.body.data.companyName).toBe('Bemtevi');
  });

  it('companyId fora do escopo, competência alheia e ids mal formados', async () => {
    const foreignCompany = await session.api.get(
      `/my/periods/${fixture.periodId}?companyId=${strangerBoxes.Corvo.id}`,
    );
    expect(foreignCompany.status).toBe(404);
    expect(foreignCompany.body.error.code).toBe('NOT_FOUND');

    const foreignPeriod = await stranger.api.get(`/my/periods/${fixture.periodId}`);
    expect(foreignPeriod.status).toBe(404);

    const ghost = await session.api.get(`/my/periods/${GHOST_ID}`);
    expect(ghost.status).toBe(404);

    const malformed = await session.api.get('/my/periods/nao-e-uuid');
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

    const badCompany = await session.api.get(`/my/periods/${fixture.periodId}?companyId=abc`);
    expect(badCompany.status).toBe(422);
  });

  it('inscrição de push na sessão cobre todos os vínculos e não expira', async () => {
    const body = pushBody();
    const res = await session.api.post('/my/push/subscribe', body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ endpoint: body.endpoint });

    const rows = await db
      .select({ contactId: pushSubscription.contactId, expiresAt: pushSubscription.expiresAt })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, body.endpoint));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.expiresAt === null)).toBe(true);

    const removed = await rawRequest('DELETE', '/my/push/subscribe', {
      cookie: session.cookie,
      body: { endpoint: body.endpoint },
    });
    expect(removed.status).toBe(204);
    expect(
      await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, body.endpoint)),
    ).toHaveLength(0);

    const again = await rawRequest('DELETE', '/my/push/subscribe', {
      cookie: session.cookie,
      body: { endpoint: body.endpoint },
    });
    expect(again.status).toBe(404);

    const invalid = await session.api.post('/my/push/subscribe', {
      endpoint: 'https://atacante.example.com/x',
      keys: { p256dh: 'x', auth: 'y' },
    });
    expect(invalid.status).toBe(422);
  });

  /* Quem ativou pelo Link chega sem credencial, então a PRIMEIRA chamada cria a senha. A
   * segunda é recusada: trocar senha existente exige o fluxo de redefinição, não este. */
  it('POST /my/password cria a primeira senha e recusa a segunda', async () => {
    const first = await session.api.post('/my/password', { password: 'outra-senha-valida-9' });
    expect(first.status, JSON.stringify(first.body)).toBe(204);

    const second = await session.api.post('/my/password', { password: 'mais-uma-senha-valida-9' });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('PASSWORD_ALREADY_SET');
  });

  it('senha curta em POST /my/password → 422 antes da better-auth', async () => {
    const res = await session.api.post('/my/password', { password: 'curta' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('Empresa inativa sai do escopo; sem nenhuma ativa o acesso cai (403)', async () => {
    const deactivateB = await fixture.firm.api.patch(`/companies/${fixture.boxes.Bemtevi.id}`, {
      active: false,
    });
    expect(deactivateB.status).toBe(200);

    const partial = await session.api.get('/my/profile');
    expect(partial.status).toBe(200);
    expect(partial.body.data.companies.map((row: any) => row.companyName)).toEqual(['Andorinha']);

    const deactivateA = await fixture.firm.api.patch(`/companies/${fixture.boxes.Andorinha.id}`, {
      active: false,
    });
    expect(deactivateA.status).toBe(200);

    const blocked = await session.api.get('/my/profile');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('FORBIDDEN');
    expect(blocked.body.error.message).toContain('inativa');
  });
});

describe('upload logado (/my/documents) e leitura de conteúdo', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let session: { api: Api; cookie: string };
  let stranger: { api: Api; cookie: string };
  let strangerRequestId: string;
  let box: CompanyBox;

  beforeAll(async () => {
    fixture = await openFirmWithCompanies([{ name: 'Unica' }]);
    box = fixture.boxes.Unica;
    session = await contactSession(box.uploadToken, box.contactEmail);

    const other = await openFirmWithCompanies([{ name: 'Alheia' }]);
    strangerRequestId = other.boxes.Alheia.requestId;
    stranger = await contactSession(
      other.boxes.Alheia.uploadToken,
      other.boxes.Alheia.contactEmail,
    );
  });

  it('presign de Documento Extra reserva a linha como awaiting_upload', async () => {
    const presigned = await session.api.post('/my/documents', {
      requestId: box.requestId,
      files: [{ fileName: 'extrato.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    expect(presigned.status, JSON.stringify(presigned.body)).toBe(201);
    const [slot] = presigned.body.data.files;
    expect(slot).toMatchObject({ fileName: 'extrato.csv', accepted: true });
    expect(slot.uploadUrl).toContain('/storage/local/');

    const [row] = await db
      .select({
        uploadStatus: document.uploadStatus,
        uploadedByContactId: document.uploadedByContactId,
      })
      .from(document)
      .where(eq(document.id, slot.documentId));
    expect(row.uploadStatus).toBe('awaiting_upload');
    expect(row.uploadedByContactId).not.toBeNull();

    const content = await session.api.get(`/my/documents/${slot.documentId}/content`);
    expect(content.status, 'sem upload confirmado não há conteúdo').toBe(404);
  });

  it('PUT + confirm sobem o Extra; GET devolve os bytes com content-type seguro', async () => {
    const { documentId, confirmed } = await uploadDocument(session.api, box.requestId, {
      fileName: 'extrato.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });
    expect(confirmed).toEqual({ confirmed: 1, submittedItemIds: [], refused: [] });

    const [row] = await db
      .select({ uploadStatus: document.uploadStatus, checksum: document.checksum })
      .from(document)
      .where(eq(document.id, documentId));
    expect(row.uploadStatus).toBe('uploaded');
    expect(row.checksum).toHaveLength(64);

    const res = await rawRequest('GET', `/my/documents/${documentId}/content`, {
      cookie: session.cookie,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(await res.text()).toBe(CSV_CONTENT);

    const foreign = await stranger.api.get(`/my/documents/${documentId}/content`);
    expect(foreign.status, 'documento de outra firma é invisível').toBe(404);

    const detail = await session.api.get(`/my/periods/${fixture.periodId}`);
    expect(detail.body.data.extraDocuments).toHaveLength(1);
    expect(detail.body.data.extraDocuments[0]).toMatchObject({
      fileName: 'extrato.csv',
      uploadedByName: box.contactName,
    });
  });

  it('upload mirado num Item marca o Item como submitted', async () => {
    const pending = await session.api.get('/my/pending');
    const itemId = pending.body.data[0].item.id as string;

    const { confirmed } = await uploadDocument(
      session.api,
      box.requestId,
      { fileName: 'comprovante.png', content: PNG_1X1, contentType: 'image/png' },
      itemId,
    );
    expect(confirmed).toMatchObject({ confirmed: 1, submittedItemIds: [itemId] });

    const after = await session.api.get('/my/pending');
    expect(after.body.data[0].item.status).toBe('submitted');
  });

  it('Solicitação de outra Empresa → 404; sem requestId → 422 do guard', async () => {
    const foreign = await session.api.post('/my/documents', {
      requestId: strangerRequestId,
      files: [{ fileName: 'extrato.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.message).toContain('Solicitação não encontrada');

    const missing = await session.api.post('/my/documents', {
      files: [{ fileName: 'extrato.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    expect(missing.status).toBe(422);
    expect(missing.body.error.message).toContain('Informe a Solicitação');
  });

  it('requestId fora do formato uuid → 422, não 500', async () => {
    /* O guard precisa do id antes do handler, então ele mesmo confere o formato: sem isso a
     * consulta levava o valor cru ao Postgres e o `invalid input syntax for type uuid` virava
     * erro do servidor. */
    const res = await session.api.post('/my/documents', {
      requestId: 'nao-e-uuid',
      files: [{ fileName: 'extrato.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('arquivo de formato recusado volta accepted:false com motivo, sem reserva', async () => {
    const res = await session.api.post('/my/documents', {
      requestId: box.requestId,
      files: [{ fileName: 'virus.exe', contentType: 'application/pdf', sizeBytes: 10 }],
    });
    expect(res.status).toBe(201);
    const [slot] = res.body.data.files;
    expect(slot.accepted).toBe(false);
    expect(slot.reason).toContain('.exe');
    expect(slot.documentId).toBeUndefined();
  });

  it('confirmar documentos de outra Solicitação → 404', async () => {
    const res = await session.api.post('/my/documents/confirm', {
      requestId: box.requestId,
      documentIds: [GHOST_ID],
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Nenhum documento');
  });
});

describe('recuperação de acesso (/access/recover)', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let linkOnly: CompanyBox;
  let withAccess: CompanyBox;

  const SAME_MESSAGE = 'Se este email estiver cadastrado, o link de envio chega em instantes.';

  const mintConfirmToken = async (email: string) => {
    const open = await db
      .select({ requestId: request.id, uploadLinkTokenHash: uploadLink.tokenHash })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .innerJoin(request, eq(request.companyId, company.id))
      .leftJoin(uploadLink, eq(uploadLink.requestId, request.id))
      .where(eq(contact.email, email));
    expect(open.length).toBeGreaterThan(0);

    return signRecoveryToken(email, recoveryFingerprint(open), 60_000);
  };

  const currentTokenHash = async (requestId: string) => {
    const [row] = await db
      .select({ tokenHash: uploadLink.tokenHash })
      .from(uploadLink)
      .where(eq(uploadLink.requestId, requestId));

    return row.tokenHash;
  };

  beforeAll(async () => {
    fixture = await openFirmWithCompanies([{ name: 'SoLink' }, { name: 'JaTemConta' }]);
    linkOnly = fixture.boxes.SoLink;
    withAccess = fixture.boxes.JaTemConta;
    const activated = await activate(withAccess.uploadToken);
    expect(activated.status).toBe(201);
  });

  it('email desconhecido: resposta cega com piso de tempo', async () => {
    const startedAt = Date.now();
    const res = await apiClient(app.url).post('/access/recover', {
      email: 'ninguem@example.com',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ message: SAME_MESSAGE });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(600);
  });

  it('contato sem acesso: mesma resposta, nada muda no banco (o token vai só no email)', async () => {
    const res = await apiClient(app.url).post('/access/recover', { email: linkOnly.contactEmail });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ message: SAME_MESSAGE });
    expect(await magicLinkTokenFor(linkOnly.contactEmail)).toBeUndefined();
  });

  it('contato com acesso recebe magic link direto (sem rotação)', async () => {
    const hashBefore = await currentTokenHash(withAccess.requestId);
    const res = await apiClient(app.url).post('/access/recover', {
      email: withAccess.contactEmail,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ message: SAME_MESSAGE });
    expect(await magicLinkTokenFor(withAccess.contactEmail)).toBeDefined();
    expect(await currentTokenHash(withAccess.requestId)).toBe(hashBefore);
  });

  it('confirmação com token válido rotaciona o Link, registra o reenvio e mata o antigo', async () => {
    const hashBefore = await currentTokenHash(linkOnly.requestId);
    const confirmToken = await mintConfirmToken(linkOnly.contactEmail);

    const res = await apiClient(app.url).post('/access/recover/confirm', { token: confirmToken });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ message: SAME_MESSAGE });

    const hashAfter = await currentTokenHash(linkOnly.requestId);
    expect(hashAfter).not.toBe(hashBefore);

    const deliveries = await db
      .select({ purpose: message.purpose, recipient: message.recipient, status: message.status })
      .from(message)
      .where(eq(message.requestId, linkOnly.requestId));
    expect(deliveries.filter((row) => row.purpose === 'resend')).toEqual([
      { purpose: 'resend', recipient: linkOnly.contactEmail, status: 'sent' },
    ]);

    const oldToken = await apiClient(app.url).post(
      `/upload/${linkOnly.uploadToken}/push`,
      pushBody(),
    );
    expect(oldToken.status, 'token antigo morre na rotação').toBe(404);

    const replay = await apiClient(app.url).post('/access/recover/confirm', {
      token: confirmToken,
    });
    expect(replay.status).toBe(201);
    expect(await currentTokenHash(linkOnly.requestId), 'replay não rotaciona de novo').toBe(
      hashAfter,
    );
  });

  it('token de confirmação adulterado/lixo: resposta cega, sem rotação', async () => {
    const hashBefore = await currentTokenHash(linkOnly.requestId);
    const res = await apiClient(app.url).post('/access/recover/confirm', {
      token: 'a.b.c.assinatura-falsa',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ message: SAME_MESSAGE });
    expect(await currentTokenHash(linkOnly.requestId)).toBe(hashBefore);
  });

  it('validação: email inválido e token vazio → 422', async () => {
    const anon = apiClient(app.url);
    const badEmail = await anon.post('/access/recover', { email: 'nao-email' });
    expect(badEmail.status).toBe(422);
    expect(badEmail.body.error.code).toBe('VALIDATION_ERROR');

    const noToken = await anon.post('/access/recover/confirm', {});
    expect(noToken.status).toBe(422);
  });

  it('limite por IP: a 4ª tentativa em 60s → 429 TOO_MANY_REQUESTS', async () => {
    const anon = apiClient(app.url);
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await anon.post('/access/recover', { email: `limite-${attempt}@example.com` });
      expect(res.status).toBe(201);
    }

    const blocked = await anon.post('/access/recover', { email: 'limite-4@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

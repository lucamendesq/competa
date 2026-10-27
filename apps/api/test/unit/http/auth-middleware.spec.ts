import { createServer } from 'node:http';
import { eq } from 'drizzle-orm';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BetterAuthAdapter } from '../../../src/infra/auth/better-auth.adapter.js';
import { appServices } from '../../../src/effect/runtime.js';
import {
  ContactContext,
  FirmContext,
  SessionContext,
  UploadContext,
} from '../../../src/http/context.js';
import { handler } from '../../../src/http/envelope.js';
import {
  contactRoute,
  contactUploadRoute,
  firmRoute,
  sessionRoute,
  uploadPresignRoute,
  uploadTokenRoute,
} from '../../../src/http/middleware/auth.js';
import { ThrottleStore, TrustProxy, route } from '../../../src/http/platform.js';
import { makeThrottleStore, throttleDefault } from '../../../src/http/throttle.js';
import { createToken } from '../../../src/lib/token.js';
import { isFailure } from '../../../src/lib/either.js';
import {
  accountant,
  accountingFirm,
  company,
  contact,
  period,
  request,
  subscription,
  uploadLink,
} from '../../../src/infra/database/schema/index.js';
import { db } from '../../support/db.js';

const read = <I, S>(tag: Context.Key<I, S>) => Effect.map(Effect.service(tag), (value) => value);

/* Servidor Effect sem Nest: o que está sob teste são os perfis de `middleware/auth.ts`
 * sobre rotas sintéticas — as rotas reais são provadas pelas suites de caracterização. */
const probes = Layer.mergeAll(
  route('GET', '/probe/firm', handler('GET', read(FirmContext)), { auth: firmRoute() }),
  route('POST', '/probe/firm', handler('POST', Effect.as(read(FirmContext), 'written')), {
    auth: firmRoute(),
  }),
  route('GET', '/probe/zip', handler('GET', Effect.as(read(FirmContext), 'zipped')), {
    auth: firmRoute({ requires: 'periodZip' }),
  }),
  route('GET', '/probe/contact', handler('GET', read(ContactContext)), { auth: contactRoute }),
  route('GET', '/probe/session', handler('GET', read(SessionContext)), { auth: sessionRoute }),
  route('GET', '/probe/upload/:token', handler('GET', read(UploadContext)), {
    auth: uploadTokenRoute({ uploadThrottle: true }),
  }),
  route('POST', '/probe/recover', handler('POST', Effect.succeed({ sent: true })), {
    throttle: throttleDefault(3, 60_000),
  }),
  route('POST', '/probe/contact-upload', handler('POST', read(UploadContext)), {
    auth: contactUploadRoute,
  }),
  route('POST', '/probe/presign/:token', handler('POST', read(UploadContext)), {
    auth: uploadPresignRoute,
  }),
);

const boot = async () => {
  const runtime = ManagedRuntime.make(
    HttpRouter.serve(probes, { disableLogger: true, disableListenLog: true }).pipe(
      Layer.provideMerge(NodeHttpServer.layer(createServer, { port: 0 })),
      Layer.provideMerge(Layer.succeed(TrustProxy)(true)),
      Layer.provideMerge(Layer.sync(ThrottleStore)(() => makeThrottleStore())),
      Layer.provide(appServices),
    ),
  );
  const server = Context.get(await runtime.context(), HttpServer.HttpServer);
  const url = HttpServer.formatAddress(server.address)
    .replace('[::]', '127.0.0.1')
    .replace('[::1]', '127.0.0.1');

  return { url, close: () => runtime.dispose() };
};

let app: { url: string; close: () => Promise<void> };

let seq = 0;
const ip = () => `10.90.0.${++seq}`;

const call = async (
  method: string,
  path: string,
  opts: { cookie?: string; ip?: string; body?: unknown; rawBody?: string } = {},
) => {
  const payload = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  const response = await fetch(`${app.url}${path}`, {
    method,
    headers: {
      'x-forwarded-for': opts.ip ?? ip(),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie === undefined ? {} : { cookie: opts.cookie }),
    },
    body: payload,
  });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : undefined };
};

const auth = new BetterAuthAdapter();

/** Sessão real do better-auth sem subir o Nest: o adapter já manda `x-internal-signup`. */
const signUp = async (label: string) => {
  const created = await auth.signUpEmail({
    name: `User ${label}`,
    email: `mw-${label}-${Date.now().toString(36)}-${++seq}@example.com`,
    password: 'senha-forte-123',
  });
  if (isFailure(created)) throw created.error;

  return {
    userId: created.value.userId,
    cookie: (created.value.setCookie ?? []).map((value) => value.split(';')[0]).join('; '),
  };
};

const seedFirm = async (
  authUserId: string,
  options: { planName?: string; status?: string; trialEndsAt?: Date } = {},
) => {
  const [firm] = await db
    .insert(accountingFirm)
    .values({ name: `Firma ${++seq}` })
    .returning({ id: accountingFirm.id });

  await db.insert(subscription).values({
    accountingFirmId: firm.id,
    planName: options.planName ?? 'trial',
    status: options.status ?? 'trialing',
    trialEndsAt: options.trialEndsAt ?? new Date(Date.now() + 86_400_000),
  });

  const [row] = await db
    .insert(accountant)
    .values({ authUserId, accountingFirmId: firm.id, owner: true })
    .returning({ id: accountant.id });

  return { firmId: firm.id, accountantId: row.id };
};

const seedContact = async (authUserId: string, active = true) => {
  const [firm] = await db
    .insert(accountingFirm)
    .values({ name: `Firma ${++seq}` })
    .returning({ id: accountingFirm.id });
  const [companyRow] = await db
    .insert(company)
    .values({ accountingFirmId: firm.id, name: `Empresa ${seq}`, active })
    .returning({ id: company.id });
  const [row] = await db
    .insert(contact)
    .values({
      companyId: companyRow.id,
      name: `Resp ${seq}`,
      email: `resp-${seq}@example.com`,
      authUserId,
    })
    .returning({ id: contact.id });

  return { companyId: companyRow.id, contactId: row.id };
};

const seedUploadLink = async (options: { revoked?: boolean; expiresAt?: Date } = {}) => {
  const [firm] = await db
    .insert(accountingFirm)
    .values({ name: `Firma ${++seq}` })
    .returning({ id: accountingFirm.id });
  const [companyRow] = await db
    .insert(company)
    .values({ accountingFirmId: firm.id, name: `Empresa ${seq}` })
    .returning({ id: company.id });
  const [contactRow] = await db
    .insert(contact)
    .values({ companyId: companyRow.id, name: `Resp ${seq}`, email: `link-${seq}@example.com` })
    .returning({ id: contact.id });
  const [periodRow] = await db
    .insert(period)
    .values({ accountingFirmId: firm.id, referenceMonth: '2030-01-01', dueDate: '2030-02-10' })
    .returning({ id: period.id });
  const [requestRow] = await db
    .insert(request)
    .values({ periodId: periodRow.id, companyId: companyRow.id })
    .returning({ id: request.id });

  const { token, tokenHash } = createToken();
  await db.insert(uploadLink).values({
    requestId: requestRow.id,
    contactId: contactRow.id,
    tokenHash,
    revoked: options.revoked ?? false,
    expiresAt: options.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
  });

  return { token, requestId: requestRow.id, contactId: contactRow.id };
};

/** Solicitação aberta na Empresa de um Responsável já vinculado — o que o
 *  `contactUploadRoute` resolve a partir do `requestId` do corpo. */
const seedRequestFor = async (companyId: string) => {
  const [firmRow] = await db
    .select({ accountingFirmId: company.accountingFirmId })
    .from(company)
    .where(eq(company.id, companyId));
  const [periodRow] = await db
    .insert(period)
    .values({
      accountingFirmId: firmRow.accountingFirmId,
      referenceMonth: '2030-03-01',
      dueDate: '2030-04-10',
    })
    .returning({ id: period.id });
  const [requestRow] = await db
    .insert(request)
    .values({ periodId: periodRow.id, companyId })
    .returning({ id: request.id });

  return requestRow.id;
};

/* Sem `truncateAll()` de propósito: cada caso semeia linhas próprias (sufixo `seq` + email
 * único), então não precisa de banco limpo — e truncar aqui tomaria um ACCESS EXCLUSIVE no
 * banco compartilhado, brigando com as suites de caracterização que rodam em volta. */
beforeAll(async () => {
  app = await boot();
});

afterAll(() => app.close());

describe('firmRoute', () => {
  it('sem sessão → 401 UNAUTHENTICATED', async () => {
    const response = await call('GET', '/probe/firm');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('sessão sem vínculo de Contabilidade → 403 FORBIDDEN', async () => {
    const { cookie } = await signUp('orfa');
    const response = await call('GET', '/probe/firm', { cookie });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body.error.message).toContain('não pertence a uma Contabilidade');
  });

  it('entrega escopo, accountantId, plano e sessão ao handler', async () => {
    const { userId, cookie } = await signUp('firm');
    const seeded = await seedFirm(userId, { planName: 'essencial', status: 'ACTIVE' });

    const response = await call('GET', '/probe/firm', { cookie });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      scope: seeded.firmId,
      accountantId: seeded.accountantId,
      planName: 'essencial',
      session: { user: { id: userId, name: expect.any(String), email: expect.any(String) } },
    });
  });

  it('plano desconhecido no banco chega cru ao contexto (o gate é quem nega)', async () => {
    const { userId, cookie } = await signUp('plano-torto');
    await seedFirm(userId, { planName: 'plano-que-nao-existe' });

    const response = await call('GET', '/probe/firm', { cookie });
    expect(response.body.data.planName).toBe('plano-que-nao-existe');

    expect((await call('GET', '/probe/zip', { cookie })).status).toBe(402);
  });
});

describe('firmRoute — Defaulting Rule (COM-8)', () => {
  it('OVERDUE: GET passa, escrita leva 402 PAYMENT_REQUIRED', async () => {
    const { userId, cookie } = await signUp('overdue');
    await seedFirm(userId, { status: 'OVERDUE' });

    const read = await call('GET', '/probe/firm', { cookie });
    expect(read.status).toBe(200);

    const write = await call('POST', '/probe/firm', { cookie });
    expect(write.status).toBe(402);
    expect(write.body.error.code).toBe('PAYMENT_REQUIRED');
  });

  it('CANCELED: escrita leva 402', async () => {
    const { userId, cookie } = await signUp('canceled');
    await seedFirm(userId, { status: 'CANCELED' });

    const write = await call('POST', '/probe/firm', { cookie });
    expect(write.status).toBe(402);
  });

  it('trial vencido: escrita leva 402; trial vigente escreve', async () => {
    const expired = await signUp('trial-vencido');
    await seedFirm(expired.userId, {
      status: 'trialing',
      trialEndsAt: new Date(Date.now() - 86_400_000),
    });
    const blocked = await call('POST', '/probe/firm', { cookie: expired.cookie });
    expect(blocked.status).toBe(402);

    const alive = await signUp('trial-vigente');
    await seedFirm(alive.userId);
    const allowed = await call('POST', '/probe/firm', { cookie: alive.cookie });
    expect(allowed.status).toBe(201);
  });
});

describe('firmRoute({ requires })', () => {
  it('plano sem a capability → 402 PLAN_CAPABILITY_REQUIRED com o plano alvo', async () => {
    const { userId, cookie } = await signUp('essencial');
    await seedFirm(userId, { planName: 'essencial', status: 'ACTIVE' });

    const response = await call('GET', '/probe/zip', { cookie });

    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe('PLAN_CAPABILITY_REQUIRED');
    expect(response.body.error.details).toEqual({
      capability: 'periodZip',
      requiredPlan: 'profissional',
    });
  });

  it('plano com a capability passa', async () => {
    const { userId, cookie } = await signUp('profissional');
    await seedFirm(userId, { planName: 'profissional', status: 'ACTIVE' });

    const response = await call('GET', '/probe/zip', { cookie });

    expect(response.status).toBe(200);
    expect(response.body.data).toBe('zipped');
  });
});

describe('contactRoute', () => {
  it('sem sessão → 401', async () => {
    expect((await call('GET', '/probe/contact')).status).toBe(401);
  });

  it('sessão sem vínculo de Responsável → 403', async () => {
    const { cookie } = await signUp('nao-responsavel');
    const response = await call('GET', '/probe/contact', { cookie });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('não é de um Responsável');
  });

  it('empresa inativa derruba o acesso com mensagem própria', async () => {
    const { userId, cookie } = await signUp('inativa');
    await seedContact(userId, false);

    const response = await call('GET', '/probe/contact', { cookie });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('inativa');
  });

  it('entrega os vínculos ativos ao handler', async () => {
    const { userId, cookie } = await signUp('responsavel');
    const seeded = await seedContact(userId);

    const response = await call('GET', '/probe/contact', { cookie });

    expect(response.status).toBe(200);
    expect(response.body.data.scope).toEqual({
      memberships: [{ contactId: seeded.contactId, companyId: seeded.companyId }],
    });
    expect(response.body.data.session.user.id).toBe(userId);
  });
});

describe('sessionRoute', () => {
  it('sem sessão → 401', async () => {
    expect((await call('GET', '/probe/session')).status).toBe(401);
  });

  it('qualquer sessão serve, mesmo sem Contabilidade nem Empresa', async () => {
    const { userId, cookie } = await signUp('sessao-nua');
    const response = await call('GET', '/probe/session', { cookie });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(userId);
  });
});

describe('uploadTokenRoute', () => {
  it('link válido entrega o UploadScope, sem sessão', async () => {
    const link = await seedUploadLink();
    const response = await call('GET', `/probe/upload/${link.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      scope: { requestId: link.requestId, contactId: link.contactId },
    });
  });

  it('token desconhecido, revogado e vencido → mesmo 404 cego', async () => {
    const revoked = await seedUploadLink({ revoked: true });
    const expired = await seedUploadLink({ expiresAt: new Date(Date.now() - 1000) });

    for (const token of ['nao-existe', revoked.token, expired.token]) {
      const response = await call('GET', `/probe/upload/${token}`);
      expect(response.status, token).toBe(404);
      expect(response.body.error.code).toBe('UPLOAD_LINK_INVALID');
    }
  });

  it('o balde `upload-presign` é por ip:token, não só por IP', async () => {
    const first = await seedUploadLink();
    const second = await seedUploadLink();
    const caller = ip();

    const remaining = async (token: string) => {
      const response = await fetch(`${app.url}/probe/upload/${token}`, {
        headers: { 'x-forwarded-for': caller },
      });
      await response.text();

      return response.headers.get('x-ratelimit-remaining-upload-presign');
    };

    expect(await remaining(first.token)).toBe('59');
    expect(await remaining(first.token)).toBe('58');
    expect(await remaining(second.token), 'token diferente, balde próprio').toBe('59');
  });
});

describe('override do balde `default` (@Throttle)', () => {
  it('3 passam e a 4ª leva 429 no mesmo IP; o `short` continua em 30', async () => {
    const caller = ip();

    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await call('POST', '/probe/recover', { ip: caller });
      expect(response.status, `tentativa ${attempt + 1}`).toBe(201);
    }

    const blocked = await call('POST', '/probe/recover', { ip: caller });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');

    // outro IP tem balde próprio
    expect((await call('POST', '/probe/recover')).status).toBe(201);
  });
});

describe('contactUploadRoute', () => {
  it('entrega o UploadScope da Solicitação pedida no corpo', async () => {
    const { userId, cookie } = await signUp('upload-dono');
    const { companyId, contactId } = await seedContact(userId);
    const requestId = await seedRequestFor(companyId);

    const response = await call('POST', '/probe/contact-upload', {
      cookie,
      body: { requestId },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.scope).toEqual({ requestId, contactId });
    expect(response.body.data.session.user.id, 'perfil de sessão carrega o user').toBe(userId);
  });

  it('sem sessão → 401', async () => {
    const response = await call('POST', '/probe/contact-upload', { body: { requestId: 'x' } });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('Responsável com corpo sem requestId, vazio ou ilegível → 422 (nunca 400 do parser)', async () => {
    const { userId, cookie } = await signUp('upload-sem-id');
    await seedContact(userId);

    for (const opts of [{ body: {} }, {}, { rawBody: 'nao-e-json' }]) {
      const response = await call('POST', '/probe/contact-upload', { cookie, ...opts });
      expect(response.status, JSON.stringify(opts)).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  /* `@ContactRoute()` (ContactGuard) roda ANTES do `ContactUploadGuard` no Nest: quem não é
   * Responsável leva 403 sem o corpo sequer ser lido. */
  it('quem não é Responsável leva 403 antes do corpo ser olhado', async () => {
    const { cookie } = await signUp('upload-sem-vinculo');

    for (const opts of [{ body: {} }, {}, { body: { requestId: 'nao-e-uuid' } }]) {
      const response = await call('POST', '/probe/contact-upload', { cookie, ...opts });
      expect(response.status, JSON.stringify(opts)).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('conta que não é Responsável → 403; Solicitação de outra Empresa → 404', async () => {
    const stranger = await signUp('upload-estranho');
    const other = await signUp('upload-outro');
    const { companyId } = await seedContact(other.userId);
    const requestId = await seedRequestFor(companyId);

    const forbidden = await call('POST', '/probe/contact-upload', {
      cookie: stranger.cookie,
      body: { requestId },
    });
    expect(forbidden.status).toBe(403);

    const mine = await signUp('upload-meu');
    await seedContact(mine.userId);
    const notFound = await call('POST', '/probe/contact-upload', {
      cookie: mine.cookie,
      body: { requestId },
    });
    expect(notFound.status).toBe(404);
  });

  it('empresa inativa → 403 com mensagem própria', async () => {
    const { userId, cookie } = await signUp('upload-inativa');
    const { companyId } = await seedContact(userId, false);
    const requestId = await seedRequestFor(companyId);

    const response = await call('POST', '/probe/contact-upload', { cookie, body: { requestId } });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('inativa');
  });
});

describe('uploadPresignRoute', () => {
  it('link válido entrega o UploadScope e pula os baldes globais', async () => {
    const link = await seedUploadLink();
    const caller = ip();

    const response = await fetch(`${app.url}/probe/presign/${link.token}`, {
      method: 'POST',
      headers: { 'x-forwarded-for': caller },
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toEqual({
      scope: { requestId: link.requestId, contactId: link.contactId },
    });
    expect(response.headers.get('x-ratelimit-remaining-short'), '@SkipThrottle global').toBeNull();
    expect(response.headers.get('x-ratelimit-remaining-upload-presign')).toBe('59');
  });

  it('token inválido → 404 cego', async () => {
    const response = await call('POST', '/probe/presign/nao-existe');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('UPLOAD_LINK_INVALID');
  });
});

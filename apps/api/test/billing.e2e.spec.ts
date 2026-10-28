import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import { subscription } from '../src/infra/database/schema/index.js';
import { apiClient, registerFirm, uniqueCnpj, uniqueIp, type Api } from './support/fixtures.js';

/* Ambiente de teste SEM segredos Asaas: NODE_ENV=test escolhe o LogBilling (checkout vira
 * stub de console com `checkoutUrl: ''` e `simulated: true`); ASAAS_WEBHOOK_TOKEN ausente
 * faz o webhook falhar fechado (503) antes de olhar token ou payload. O lado observável do
 * módulo é a linha de `subscription` — e é ela que o TenantGuard lê para o 402 em escrita. */

const MEMBER_PASSWORD = 'senha-de-membro-123';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

async function firmIdOf(api: Api): Promise<string> {
  const res = await api.get('/auth/me');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.accountingFirm.id;
}

const subscriptionRows = (firmId: string) =>
  db.select().from(subscription).where(eq(subscription.accountingFirmId, firmId));

const setSubscription = (firmId: string, patch: Record<string, unknown>) =>
  db.update(subscription).set(patch).where(eq(subscription.accountingFirmId, firmId));

const cookieOf = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

let memberSeq = 0;

async function registerMember(ownerApi: Api) {
  const email = `membro-billing-${Date.now().toString(36)}-${++memberSeq}@example.com`;

  const invited = await ownerApi.post('/invites', { email });
  expect(invited.status, JSON.stringify(invited.body)).toBe(201);
  const inviteToken = invited.body.data.url.split('/convite/')[1];

  const signedUp = await apiClient(app.url).post('/auth/sign-up', {
    token: inviteToken,
    name: 'Membro',
    email,
    password: MEMBER_PASSWORD,
  });
  expect(signedUp.status, JSON.stringify(signedUp.body)).toBe(201);

  const ip = uniqueIp();
  const signedIn = await fetch(`${app.url}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: MEMBER_PASSWORD }),
  });
  expect(signedIn.status, await signedIn.clone().text()).toBe(200);
  const cookie = cookieOf(signedIn.headers);
  expect(cookie).not.toBe('');

  return apiClient(app.url, { cookie, ip });
}

describe('autorização', () => {
  it('POST /billing/checkout exige sessão (401 UNAUTHENTICATED)', async () => {
    const anon = apiClient(app.url);
    const res = await anon.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /billing/checkout — fluxo com LogBilling', () => {
  let api: Api;
  let firmId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    firmId = await firmIdOf(api);
  });

  it('o cadastro provisiona a assinatura trial que o checkout vai atualizar', async () => {
    const rows = await subscriptionRows(firmId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      planName: 'trial',
      cycle: 'monthly',
      status: 'trialing',
      gatewayCustomerId: null,
      gatewaySubscriptionId: null,
      priceOverride: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    expect(rows[0].trialEndsAt).not.toBeNull();
  });

  it('checkout devolve 201 com checkoutUrl VAZIA e simulated true (stub de console)', async () => {
    const res = await api.post('/billing/checkout', { planName: 'profissional', cycle: 'yearly' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({ data: { checkoutUrl: '', simulated: true } });
  });

  /* O checkout grava INTENÇÃO, não plano. O gate de capability lê `planName`, então gravar
   * a escolha lá liberaria recurso pago antes de o dinheiro entrar. */
  it('grava a intenção e os ids do gateway; plano e status ficam como estavam', async () => {
    const rows = await subscriptionRows(firmId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pendingPlanName: 'profissional',
      pendingCycle: 'yearly',
      planName: 'trial',
      cycle: 'monthly',
    });
    expect(rows[0].gatewayCustomerId).toMatch(/^mock_cus_/);
    expect(rows[0].gatewaySubscriptionId).toMatch(/^mock_sub_/);

    /* A ativação depende do webhook PAYMENT_RECEIVED — morto neste ambiente. */
    expect(rows[0].status).toBe('trialing');
    expect(rows[0].currentPeriodStart).toBeNull();
    expect(rows[0].currentPeriodEnd).toBeNull();
  });

  /* Trocar de plano REAPROVEITA a assinatura do gateway. Criar outra deixava as duas vivas:
   * a antiga seguia cobrando e os webhooks dela paravam de casar com qualquer linha, porque
   * o checkout só sobrescrevia o id. Verificado no sandbox do Asaas: o PUT atualiza valor,
   * ciclo e a cobrança em aberto, mantendo a MESMA fatura. */
  it('cycle omitido vira monthly; a troca reusa a assinatura em vez de criar outra', async () => {
    const [before] = await subscriptionRows(firmId);

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { checkoutUrl: '', simulated: true } });

    const rows = await subscriptionRows(firmId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(before.id);
    expect(rows[0]).toMatchObject({ pendingPlanName: 'essencial', pendingCycle: 'monthly' });
    expect(rows[0].gatewaySubscriptionId, 'mesma assinatura no gateway').toBe(
      before.gatewaySubscriptionId,
    );
  });

  it('sem linha de subscription o checkout é no-op silencioso: 201 e nada gravado (quirk congelado)', async () => {
    const orphan = await registerFirm(app.url);
    const orphanFirmId = await firmIdOf(orphan.api);
    await db.delete(subscription).where(eq(subscription.accountingFirmId, orphanFirmId));

    /* `startCheckout` é UPDATE, não upsert: 0 linhas afetadas e o controller responde
     * sucesso mesmo assim. Só alcançável por cirurgia no banco — nenhuma rota cria firma
     * sem subscription — mas o update-sem-linha é comportamento a preservar na migração. */
    const res = await orphan.api.post('/billing/checkout', { planName: 'escritorio' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { checkoutUrl: '', simulated: true } });
    expect(await subscriptionRows(orphanFirmId)).toEqual([]);
  });
});

/* O Asaas não emite cobrança sem o documento do pagador. A firma cadastrada sem CNPJ manda no
 * corpo do checkout, e ele fica gravado para sempre. */
describe('CNPJ obrigatório no checkout', () => {
  let api: Api;
  let firmId: string;

  beforeAll(async () => {
    const email = `sem-cnpj-${Date.now().toString(36)}@example.com`;
    const res = await apiClient(app.url).post('/auth/register', {
      firmName: 'Sem CNPJ',
      userName: 'Dona',
      email,
      password: 'senha-forte-123',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const cookie = cookieOf(res.headers);
    api = apiClient(app.url, { cookie });
    firmId = await firmIdOf(api);
  });

  it('firma sem CNPJ e corpo sem CNPJ → 422 apontando o campo; nada gravado', async () => {
    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { path: ['cnpj'], message: 'Informe o CNPJ da Contabilidade para emitir a cobrança.' },
    ]);
    const [row] = await subscriptionRows(firmId);
    expect(row.gatewayCustomerId).toBeNull();
  });

  it('CNPJ inválido no corpo → 422 VALIDATION_ERROR', async () => {
    const res = await api.post('/billing/checkout', {
      planName: 'essencial',
      cnpj: '11111111111111',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('CNPJ no corpo: 201, fica gravado na firma e o próximo checkout dispensa', async () => {
    const cnpj = uniqueCnpj();
    const res = await api.post('/billing/checkout', { planName: 'essencial', cnpj });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const firm = await api.get('/accounting-firm');
    expect(firm.body.data.cnpj).toBe(cnpj);

    const again = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(again.status).toBe(201);
  });
});

describe('validação (zodPipe → 422)', () => {
  let api: Api;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  it('planName ausente, trial, desconhecido ou cycle inválido → 422 VALIDATION_ERROR', async () => {
    for (const body of [
      {},
      { planName: 'trial' },
      { planName: 'premium' },
      { planName: 'essencial', cycle: 'weekly' },
    ]) {
      const res = await api.post('/billing/checkout', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });
});

describe('permissões de equipe (dono vs membro)', () => {
  it('membro não assina: 403 ONLY_OWNER_CAN_MANAGE_TEAM e a linha fica intocada', async () => {
    const { api: ownerApi } = await registerFirm(app.url);
    const firmId = await firmIdOf(ownerApi);
    const memberApi = await registerMember(ownerApi);

    const res = await memberApi.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONLY_OWNER_CAN_MANAGE_TEAM');

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({
      planName: 'trial',
      gatewayCustomerId: null,
      gatewaySubscriptionId: null,
    });
  });
});

describe('GET /billing/subscription', () => {
  let api: Api;
  let firmId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    firmId = await firmIdOf(api);
  });

  it('firma em trial: plano vigente, sem intenção e sem fatura', async () => {
    const res = await api.get('/billing/subscription');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      planName: 'trial',
      status: 'trialing',
      pendingPlanName: null,
      pendingCycle: null,
      /* Sem assinatura no gateway não há o que consultar — e o FAQ do Asaas pede para não
       * usar GET como polling. */
      invoiceUrl: null,
    });
    expect(res.body.data.trialEndsAt).toBeTruthy();
  });

  /* A tela precisa separar "contratou" de "está valendo": entre o checkout e o pagamento, o
   * plano vigente ainda é o antigo. */
  it('após o checkout mostra a intenção sem mudar o plano vigente', async () => {
    const checkout = await api.post('/billing/checkout', {
      planName: 'profissional',
      cycle: 'yearly',
    });
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(201);

    const res = await api.get('/billing/subscription');
    expect(res.body.data).toMatchObject({
      planName: 'trial',
      status: 'trialing',
      pendingPlanName: 'profissional',
      pendingCycle: 'yearly',
    });
  });

  it('exige sessão de Contabilidade', async () => {
    const anon = await apiClient(app.url).get('/billing/subscription');
    expect(anon.status).toBe(401);
  });

  it('não vaza a assinatura de outra Contabilidade', async () => {
    const other = await registerFirm(app.url);
    const res = await other.api.get('/billing/subscription');

    expect(res.status).toBe(200);
    expect(res.body.data.planName).toBe('trial');
    expect(await firmIdOf(other.api)).not.toBe(firmId);
  });
});

describe('isolamento entre firmas', () => {
  it('checkout de uma firma não toca a assinatura da outra', async () => {
    const [a, b] = await Promise.all([registerFirm(app.url), registerFirm(app.url)]);
    const [firmA, firmB] = await Promise.all([firmIdOf(a.api), firmIdOf(b.api)]);

    const res = await a.api.post('/billing/checkout', { planName: 'escritorio', cycle: 'yearly' });
    expect(res.status).toBe(201);

    const [rowA] = await subscriptionRows(firmA);
    expect(rowA.pendingPlanName).toBe('escritorio');

    const [rowB] = await subscriptionRows(firmB);
    expect(rowB).toMatchObject({
      pendingPlanName: null,
      planName: 'trial',
      status: 'trialing',
      gatewayCustomerId: null,
      gatewaySubscriptionId: null,
    });
  });
});

describe('webhook Asaas — ASAAS_WEBHOOK_TOKEN ausente falha fechado', () => {
  let gatewaySubscriptionId: string;
  let firmId: string;

  beforeAll(async () => {
    const { api } = await registerFirm(app.url);
    firmId = await firmIdOf(api);
    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status).toBe(201);
    const [row] = await subscriptionRows(firmId);
    gatewaySubscriptionId = row.gatewaySubscriptionId!;
  });

  it('POST /billing/webhook/asaas é público mas recusa 503 sem o env', async () => {
    const asaas = apiClient(app.url);

    for (const body of [
      { event: 'PAYMENT_RECEIVED', payment: { subscription: gatewaySubscriptionId } },
      {},
    ]) {
      const res = await asaas.post('/billing/webhook/asaas', body);
      expect(res.status, JSON.stringify(body)).toBe(503);
      expect(res.body.error).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Webhook não configurado.',
      });
    }
  });

  it('a recusa vem ANTES do token: header asaas-access-token não muda nada', async () => {
    /* Com o env ausente os branches de token inválido (403) e de processamento de evento
     * são mortos: `secretEquals` nunca roda e nenhum status transita. */
    for (const event of ['PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED']) {
      const res = await fetch(`${app.url}/billing/webhook/asaas`, {
        method: 'POST',
        headers: {
          'x-forwarded-for': uniqueIp(),
          'content-type': 'application/json',
          'asaas-access-token': 'qualquer-coisa',
        },
        body: JSON.stringify({ event, payment: { subscription: gatewaySubscriptionId } }),
      });
      expect(res.status, event).toBe(503);
      const resBody = await res.json();
      expect(resBody.error.code).toBe('SERVICE_UNAVAILABLE');
    }

    const [row] = await subscriptionRows(firmId);
    expect(row.status).toBe('trialing');
    expect(row.currentPeriodStart).toBeNull();
    expect(row.currentPeriodEnd).toBeNull();
  });
});

describe('ciclo da assinatura lido pelo TenantGuard (402 em escrita)', () => {
  let api: Api;
  let firmId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    firmId = await firmIdOf(api);
  });

  it('status ACTIVE (o que o webhook gravaria) libera escrita', async () => {
    await setSubscription(firmId, { status: 'ACTIVE' });
    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status).toBe(201);
  });

  for (const blockedState of [
    { label: 'OVERDUE', patch: { status: 'OVERDUE' } },
    { label: 'CANCELED', patch: { status: 'CANCELED' } },
    {
      label: 'trial expirado',
      patch: { status: 'trialing', trialEndsAt: new Date('2020-01-01T00:00:00Z') },
    },
  ]) {
    it(`${blockedState.label}: escrita → 402 PAYMENT_REQUIRED, leitura segue 200`, async () => {
      await setSubscription(firmId, blockedState.patch);

      /* Bug congelado: o próprio POST /billing/checkout é escrita, então a firma bloqueada
       * por falta de pagamento não alcança o checkout para regularizar. */
      const checkout = await api.post('/billing/checkout', { planName: 'profissional' });
      expect(checkout.status).toBe(402);
      expect(checkout.body.error).toEqual({
        code: 'PAYMENT_REQUIRED',
        message: 'Assinatura inativa. Regularize para continuar.',
      });

      /* Guard roda antes do zodPipe: corpo inválido ainda é 402, não 422. */
      const write = await api.post('/periods', {});
      expect(write.status).toBe(402);
      expect(write.body.error.code).toBe('PAYMENT_REQUIRED');

      const read = await api.get('/periods');
      expect(read.status).toBe(200);
      expect(read.body.data).toEqual([]);
    });
  }

  it('trialing sem trialEndsAt não expira: escrita liberada', async () => {
    await setSubscription(firmId, { status: 'trialing', trialEndsAt: null });
    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.status).toBe(201);
  });
});

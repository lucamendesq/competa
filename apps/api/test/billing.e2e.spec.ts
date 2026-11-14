import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import { accountingFirm, company, subscription } from '../src/infra/database/schema/index.js';
import { PLANS, planPrice } from '@competa/contracts';
import { billing } from '../src/modules/billing/gateway.js';
import { upgradeChargeNow } from '../src/modules/billing/billing-rules.js';
import { Logger } from '../src/lib/logger.js';
import * as Sentry from '@sentry/node';
import { apiClient, registerFirm, uniqueCnpj, uniqueIp, type Api } from './support/fixtures.js';

/* Ambiente de teste SEM segredos Asaas: NODE_ENV=test escolhe o LogBilling (checkout vira
 * stub de console com `checkoutUrl: ''` e `simulated: true`); ASAAS_WEBHOOK_TOKEN ausente
 * faz o webhook falhar fechado (503) antes de olhar token ou payload. O lado observável do
 * módulo é a linha de `subscription` — e é ela que o TenantGuard lê para o 402 em escrita. */

vi.mock('@sentry/node', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/node')>()),
  captureException: vi.fn(),
}));

const MEMBER_PASSWORD = 'senha-de-membro-123';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(res.body).toEqual({
      data: { checkoutUrl: '', simulated: true, applied: false, scheduled: false },
    });
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
    /* Troca sem fatura em aberto no stub: a intenção fica gravada e vale na próxima. */
    expect(res.body).toEqual({
      data: { checkoutUrl: null, simulated: true, applied: false, scheduled: false },
    });

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
    expect(res.body).toEqual({
      data: { checkoutUrl: '', simulated: true, applied: false, scheduled: false },
    });
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

describe('checkout concorrente da mesma firma', () => {
  it('o segundo leva 409 CHECKOUT_IN_FLIGHT enquanto o primeiro está no gateway', async () => {
    const { api } = await registerFirm(app.url);

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const inGateway = new Promise<void>((resolve) => (entered = resolve));
    const original = billing.getOrCreateCustomer.bind(billing);
    vi.spyOn(billing, 'getOrCreateCustomer').mockImplementationOnce(async (input) => {
      entered();
      await held;
      return original(input);
    });

    const first = api.post('/billing/checkout', { planName: 'profissional' });
    await inGateway;

    const second = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(second.status, JSON.stringify(second.body)).toBe(409);
    expect(second.body.error.code).toBe('CHECKOUT_IN_FLIGHT');

    release();
    expect((await first).status).toBe(201);

    const third = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(third.status, JSON.stringify(third.body)).toBe(201);
  });
});

/* Sem e-mail de contato, a firma virava cliente do Asaas com o nosso endereço, e as faturas e
 * os lembretes chegavam para nós. Quem faz o checkout é o dono: o e-mail de login dele é o
 * destino certo. */
describe('e-mail do cliente no gateway', () => {
  it('firma sem e-mail de contato usa o e-mail de login do dono', async () => {
    const { api, email } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    await db
      .update(accountingFirm)
      .set({ contactEmail: null })
      .where(eq(accountingFirm.id, firmId));
    const customer = vi.spyOn(billing, 'getOrCreateCustomer');

    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(customer).toHaveBeenCalledWith(expect.objectContaining({ email }));
  });

  it('firma com e-mail de contato usa o dela', async () => {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    await db
      .update(accountingFirm)
      .set({ contactEmail: 'financeiro@escritorio.com.br' })
      .where(eq(accountingFirm.id, firmId));
    const customer = vi.spyOn(billing, 'getOrCreateCustomer');

    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(customer).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'financeiro@escritorio.com.br' }),
    );
  });
});

describe('descer de plano com mais Empresas ativas que a folga do plano novo', () => {
  it('422 dizendo quantas desativar; plano e intenção ficam como estavam', async () => {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    await setSubscription(firmId, { status: 'ACTIVE', planName: 'profissional' });
    await db.insert(company).values(
      Array.from({ length: 40 }, (_, i) => ({
        accountingFirmId: firmId,
        name: `Carteira ${i}`,
        active: true,
      })),
    );

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error.message).toBe(
      'O plano Essencial cobre até 36 empresas ativas e você tem 40. Desative 4 empresa(s) antes de mudar.',
    );

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({ planName: 'profissional', pendingPlanName: null });
  });
});

describe('troca de plano com assinatura em dia', () => {
  let api: Api;
  let firmId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    firmId = await firmIdOf(api);
    const first = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    await setSubscription(firmId, {
      status: 'ACTIVE',
      planName: 'profissional',
      cycle: 'monthly',
      pendingPlanName: null,
      pendingCycle: null,
      pendingPaymentId: null,
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    });
  });

  /* Plano mais barato só vale na renovação: o cliente pagou o maior até o fim do período. */
  it('downgrade é agendado: scheduled, plano atual intacto, gateway no valor novo', async () => {
    const [before] = await subscriptionRows(firmId);
    const changePlan = vi.spyOn(billing, 'changeSubscriptionPlan');

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      checkoutUrl: null,
      simulated: true,
      applied: false,
      scheduled: true,
    });

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({
      planName: 'profissional',
      cycle: 'monthly',
      status: 'ACTIVE',
      scheduledPlanName: 'essencial',
      scheduledCycle: 'monthly',
      pendingPlanName: null,
      pendingPaymentId: null,
    });
    expect(row.currentPeriodEnd?.getTime()).toBe(before.currentPeriodEnd?.getTime());

    expect(changePlan).toHaveBeenCalledTimes(1);
    expect(changePlan).toHaveBeenCalledWith(before.gatewaySubscriptionId, {
      planName: 'essencial',
      cycle: 'monthly',
      value: planPrice(PLANS.essencial, 'monthly'),
      nextDueDate: before.currentPeriodEnd,
    });
  });

  /* Upgrade cobra agora o novo ciclo descontado do que sobrou: nasce uma cobrança avulsa e
   * o plano só muda quando ela for paga (webhook, pelo id gravado). */
  it('upgrade cria cobrança avulsa e grava a intenção com o id dela', async () => {
    const res = await api.post('/billing/checkout', { planName: 'escritorio', cycle: 'yearly' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      checkoutUrl: '',
      simulated: true,
      applied: false,
      scheduled: false,
    });

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({
      planName: 'profissional',
      pendingPlanName: 'escritorio',
      pendingCycle: 'yearly',
      scheduledPlanName: 'essencial',
    });
    expect(row.pendingPaymentId).toMatch(/^mock_pay_/);
  });
});

describe('troca agendada para um plano mais barato', () => {
  async function activeFirm(patch: Record<string, unknown> = {}) {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    expect(
      (await api.post('/billing/checkout', { planName: 'profissional', cycle: 'monthly' })).status,
    ).toBe(201);
    await setSubscription(firmId, {
      status: 'ACTIVE',
      planName: 'profissional',
      cycle: 'monthly',
      pendingPlanName: null,
      pendingCycle: null,
      pendingPaymentId: null,
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      ...patch,
    });
    return { api, firmId };
  }

  const reminderTuning = (api: Api) => api.patch('/accounting-firm', { reminderMax: 5 });

  it('as capacidades do plano atual valem até o fim do período', async () => {
    const { api } = await activeFirm();
    expect(
      (await api.post('/billing/checkout', { planName: 'essencial' })).body.data.scheduled,
    ).toBe(true);

    const res = await reminderTuning(api);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('GET /billing/subscription expõe a troca e a data em que ela vale', async () => {
    const { api, firmId } = await activeFirm();
    await api.post('/billing/checkout', { planName: 'essencial' });
    const [row] = await subscriptionRows(firmId);

    const res = await api.get('/billing/subscription');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      planName: 'profissional',
      scheduledPlanName: 'essencial',
      scheduledCycle: 'monthly',
      scheduledAt: row.currentPeriodEnd?.toISOString(),
    });

    const plain = await activeFirm();
    const none = await plain.api.get('/billing/subscription');
    expect(none.body.data).toMatchObject({
      scheduledPlanName: null,
      scheduledCycle: null,
      scheduledAt: null,
    });
  });

  it('mesmo plano e ciclo com troca agendada desfaz: gateway volta ao valor atual, sem cobrança', async () => {
    const { api, firmId } = await activeFirm();
    await api.post('/billing/checkout', { planName: 'essencial' });
    const [scheduled] = await subscriptionRows(firmId);
    const changePlan = vi.spyOn(billing, 'changeSubscriptionPlan');
    const createCharge = vi.spyOn(billing, 'createCharge');

    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      checkoutUrl: null,
      simulated: true,
      applied: true,
      scheduled: false,
    });
    expect(createCharge).not.toHaveBeenCalled();
    expect(changePlan).toHaveBeenCalledWith(scheduled.gatewaySubscriptionId, {
      planName: 'profissional',
      cycle: 'monthly',
      value: planPrice(PLANS.profissional, 'monthly'),
      nextDueDate: scheduled.currentPeriodEnd,
    });

    expect(await subscriptionRows(firmId)).toMatchObject([
      { planName: 'profissional', scheduledPlanName: null, scheduledCycle: null },
    ]);
  });

  it('outro plano mais barato sobrescreve o agendamento', async () => {
    const { api, firmId } = await activeFirm({ planName: 'escritorio' });
    await api.post('/billing/checkout', { planName: 'profissional' });
    expect((await subscriptionRows(firmId))[0].scheduledPlanName).toBe('profissional');

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.body.data.scheduled).toBe(true);
    expect(await subscriptionRows(firmId)).toMatchObject([
      { planName: 'escritorio', scheduledPlanName: 'essencial' },
    ]);
  });

  it('ciclo mais barato no mesmo plano (anual para mensal) também agenda', async () => {
    const { api, firmId } = await activeFirm({ cycle: 'yearly' });

    const res = await api.post('/billing/checkout', { planName: 'profissional', cycle: 'monthly' });
    expect(res.body.data.scheduled).toBe(true);
    expect(await subscriptionRows(firmId)).toMatchObject([
      { cycle: 'yearly', scheduledPlanName: 'profissional', scheduledCycle: 'monthly' },
    ]);
  });

  it('com a próxima fatura já emitida também agenda, e não promove no pagamento dela', async () => {
    const { api, firmId } = await activeFirm();
    vi.spyOn(billing, 'pendingInvoice').mockResolvedValue({
      id: 'pay_proxima',
      invoiceUrl: 'https://www.asaas.com/i/proxima',
    });
    const changePlan = vi.spyOn(billing, 'changeSubscriptionPlan');

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.body.data).toEqual({
      checkoutUrl: null,
      simulated: true,
      applied: false,
      scheduled: true,
    });
    expect(changePlan).toHaveBeenCalledTimes(1);
    expect(await subscriptionRows(firmId)).toMatchObject([
      { planName: 'profissional', scheduledPlanName: 'essencial', pendingPaymentId: null },
    ]);
  });

  it('período já vencido não agenda: vale na hora, como antes', async () => {
    const { api, firmId } = await activeFirm({
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    });

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.body.data).toMatchObject({ applied: true, scheduled: false });
    expect(await subscriptionRows(firmId)).toMatchObject([
      { planName: 'essencial', scheduledPlanName: null },
    ]);
  });

  it('falha do gateway ao reajustar: 503 e nada fica agendado', async () => {
    const { api, firmId } = await activeFirm();
    vi.spyOn(billing, 'changeSubscriptionPlan').mockRejectedValue(new Error('Asaas fora'));

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.status).toBe(503);
    expect((await subscriptionRows(firmId))[0].scheduledPlanName).toBeNull();
  });

  it('agendar apaga a cobrança avulsa de um upgrade que ficou sem pagar', async () => {
    const { api, firmId } = await activeFirm({ planName: 'essencial' });
    expect((await api.post('/billing/checkout', { planName: 'escritorio' })).status).toBe(201);
    const charge = (await subscriptionRows(firmId))[0].pendingPaymentId!;
    await setSubscription(firmId, { planName: 'escritorio' });
    vi.spyOn(billing, 'payment').mockResolvedValue({ subscriptionId: null, open: true });
    const deletePayment = vi.spyOn(billing, 'deletePayment');

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.body.data.scheduled).toBe(true);
    expect(deletePayment).toHaveBeenCalledWith(charge);
    expect(await subscriptionRows(firmId)).toMatchObject([
      { scheduledPlanName: 'essencial', pendingPlanName: null, pendingPaymentId: null },
    ]);
  });

  it('cancelar a assinatura limpa a troca agendada', async () => {
    const { api, firmId } = await activeFirm();
    await api.post('/billing/checkout', { planName: 'essencial' });

    expect((await api.delete('/billing/subscription')).status).toBe(200);
    expect(await subscriptionRows(firmId)).toMatchObject([
      { status: 'CANCELED', scheduledPlanName: null, scheduledCycle: null },
    ]);
  });
});

describe('troca de plano com a próxima fatura já emitida pelo gateway', () => {
  const nextInvoice = { id: 'pay_proxima', invoiceUrl: 'https://www.asaas.com/i/proxima' };

  async function activeFirmWithNextInvoice() {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    expect((await api.post('/billing/checkout', { planName: 'essencial' })).status).toBe(201);
    const now = new Date();
    const periodStart = new Date(now.getTime() - 10 * 86_400_000);
    const periodEnd = new Date(now.getTime() + 20 * 86_400_000);
    await setSubscription(firmId, {
      status: 'ACTIVE',
      planName: 'essencial',
      cycle: 'monthly',
      pendingPlanName: null,
      pendingCycle: null,
      pendingPaymentId: null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
    vi.spyOn(billing, 'pendingInvoice').mockResolvedValue(nextInvoice);
    vi.useFakeTimers({ toFake: ['Date'], now });
    return { api, firmId, now, periodStart, periodEnd };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('upgrade cobra a diferença com crédito, não a fatura cheia já emitida', async () => {
    const { api, firmId, now, periodStart, periodEnd } = await activeFirmWithNextInvoice();
    const createCharge = vi.spyOn(billing, 'createCharge');
    const changePlan = vi.spyOn(billing, 'changeSubscriptionPlan');

    const res = await api.post('/billing/checkout', { planName: 'escritorio' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      checkoutUrl: '',
      simulated: true,
      applied: false,
      scheduled: false,
    });
    expect(res.body.data.checkoutUrl).not.toBe(nextInvoice.invoiceUrl);

    const expected = upgradeChargeNow({
      currentPrice: planPrice(PLANS.essencial, 'monthly'),
      newPrice: planPrice(PLANS.escritorio, 'monthly'),
      periodStart,
      periodEnd,
      now,
    });
    expect(expected).not.toBeNull();
    expect(expected!).toBeLessThan(planPrice(PLANS.escritorio, 'monthly'));
    expect(createCharge).toHaveBeenCalledTimes(1);
    expect(createCharge.mock.calls[0][0].value).toBe(expected);
    expect(changePlan).not.toHaveBeenCalled();

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({
      planName: 'essencial',
      pendingPlanName: 'escritorio',
      pendingCycle: 'monthly',
    });
    expect(row.pendingPaymentId).toMatch(/^mock_pay_/);
    expect(row.pendingPaymentId).not.toBe(nextInvoice.id);
    expect(row.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
  });

  it('um segundo upgrade ainda apaga a cobrança avulsa anterior', async () => {
    const { api, firmId } = await activeFirmWithNextInvoice();
    const first = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(first.status).toBe(201);
    const firstCharge = (await subscriptionRows(firmId))[0].pendingPaymentId!;
    vi.spyOn(billing, 'payment').mockResolvedValue({ subscriptionId: null, open: true });
    const deletePayment = vi.spyOn(billing, 'deletePayment');

    const second = await api.post('/billing/checkout', { planName: 'escritorio' });
    expect(second.status).toBe(201);
    expect(deletePayment).toHaveBeenCalledWith(firstCharge);
    expect(deletePayment).not.toHaveBeenCalledWith(nextInvoice.id);
  });

  it('preço menor com fatura emitida e período já vencido segue como antes: reajusta a fatura e grava a intenção', async () => {
    const { api, firmId } = await activeFirmWithNextInvoice();
    await setSubscription(firmId, {
      planName: 'escritorio',
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    });
    const createCharge = vi.spyOn(billing, 'createCharge');
    const changePlan = vi.spyOn(billing, 'changeSubscriptionPlan');

    const res = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      checkoutUrl: nextInvoice.invoiceUrl,
      simulated: true,
      applied: false,
      scheduled: false,
    });
    expect(createCharge).not.toHaveBeenCalled();
    expect(changePlan).toHaveBeenCalledTimes(1);

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({
      planName: 'escritorio',
      pendingPlanName: 'essencial',
      pendingPaymentId: nextInvoice.id,
    });
  });
});

describe('DELETE /billing/subscription — cancelamento', () => {
  let api: Api;
  let firmId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    firmId = await firmIdOf(api);
    const checkout = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(checkout.status).toBe(201);
    await setSubscription(firmId, {
      status: 'ACTIVE',
      planName: 'essencial',
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    });
  });

  it('membro não cancela: 403; a assinatura fica como estava', async () => {
    const memberApi = await registerMember(api);
    const res = await memberApi.delete('/billing/subscription');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONLY_OWNER_CAN_MANAGE_TEAM');
    expect((await subscriptionRows(firmId))[0].status).toBe('ACTIVE');
  });

  it('dono cancela: CANCELED, intenção limpa, e a escrita segue até o fim do período pago', async () => {
    const res = await api.delete('/billing/subscription');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELED' });
    expect(res.body.data.currentPeriodEnd).toBeTruthy();

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({
      status: 'CANCELED',
      pendingPlanName: null,
      pendingPaymentId: null,
    });

    /* Guard passa (422 é o zod do corpo vazio, não o 402 da régua). */
    const write = await api.post('/periods', {});
    expect(write.status).toBe(422);

    await setSubscription(firmId, { currentPeriodEnd: new Date(Date.now() - 86_400_000) });
    const lapsed = await api.post('/periods', {});
    expect(lapsed.status).toBe(402);

    /* Cancelar de novo é idempotente, e alcançável mesmo com a escrita bloqueada. */
    const again = await api.delete('/billing/subscription');
    expect(again.status).toBe(200);
  });
});

describe('DELETE /billing/subscription — firma em trial', () => {
  it('409 TRIAL_CANNOT_BE_CANCELED; nada muda e o gateway não é chamado', async () => {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    const checkout = await api.post('/billing/checkout', { planName: 'essencial' });
    expect(checkout.status).toBe(201);
    const before = (await subscriptionRows(firmId))[0];
    expect(before.status).toBe('trialing');
    const cancelSubscription = vi.spyOn(billing, 'cancelSubscription');
    const deletePayment = vi.spyOn(billing, 'deletePayment');

    const res = await api.delete('/billing/subscription');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('TRIAL_CANNOT_BE_CANCELED');
    expect(cancelSubscription).not.toHaveBeenCalled();
    expect(deletePayment).not.toHaveBeenCalled();

    expect((await subscriptionRows(firmId))[0]).toEqual(before);
    const write = await api.post('/periods', {});
    expect(write.status).toBe(422);
  });
});

describe('voltar depois de cancelar: o vencimento da primeira cobrança', () => {
  async function canceledFirm(periodEnd: Date) {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    expect((await api.post('/billing/checkout', { planName: 'essencial' })).status).toBe(201);
    await setSubscription(firmId, {
      status: 'ACTIVE',
      planName: 'essencial',
      cycle: 'monthly',
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
      currentPeriodEnd: periodEnd,
    });
    expect((await api.delete('/billing/subscription')).status).toBe(200);
    return { api, firmId };
  }

  it('cancelada com período pago pela frente: vence em currentPeriodEnd', async () => {
    const periodEnd = new Date(Date.now() + 20 * 86_400_000);
    const { api, firmId } = await canceledFirm(periodEnd);
    const createSubscription = vi.spyOn(billing, 'createSubscription');

    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(createSubscription.mock.calls[0][0].firstDueDate?.getTime()).toBe(periodEnd.getTime());

    const [row] = await subscriptionRows(firmId);
    expect(row).toMatchObject({ status: 'CANCELED', pendingPlanName: 'profissional' });
    expect(row.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
  });

  it('cancelada com o período já vencido: vencimento padrão do provider', async () => {
    const { api } = await canceledFirm(new Date(Date.now() - 86_400_000));
    const createSubscription = vi.spyOn(billing, 'createSubscription');

    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(createSubscription.mock.calls[0][0].firstDueDate).toBeUndefined();
  });

  it('primeiro checkout do trial: vencimento padrão do provider', async () => {
    const { api } = await registerFirm(app.url);
    const createSubscription = vi.spyOn(billing, 'createSubscription');

    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(createSubscription.mock.calls[0][0].firstDueDate).toBeUndefined();
  });
});

async function activeFirmWithUpgradeCharge() {
  const { api } = await registerFirm(app.url);
  const firmId = await firmIdOf(api);
  const first = await api.post('/billing/checkout', { planName: 'essencial' });
  expect(first.status, JSON.stringify(first.body)).toBe(201);
  await setSubscription(firmId, {
    status: 'ACTIVE',
    planName: 'essencial',
    cycle: 'monthly',
    pendingPlanName: null,
    pendingCycle: null,
    pendingPaymentId: null,
    currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
    currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
  });
  const upgrade = await api.post('/billing/checkout', { planName: 'escritorio' });
  expect(upgrade.status, JSON.stringify(upgrade.body)).toBe(201);
  const [row] = await subscriptionRows(firmId);
  expect(row.pendingPaymentId).toMatch(/^mock_pay_/);
  return { api, firmId, chargeId: row.pendingPaymentId! };
}

/* A cobrança avulsa do upgrade não pertence à assinatura: apagar a assinatura não a leva, e
 * o Asaas seguia lembrando (e aceitando pagamento de) quem já tinha cancelado. */
describe('cancelamento apaga a cobrança avulsa do upgrade', () => {
  it('o provider recebe deletePayment com o pendingPaymentId', async () => {
    const { api, chargeId } = await activeFirmWithUpgradeCharge();
    const deletePayment = vi.spyOn(billing, 'deletePayment');

    const res = await api.delete('/billing/subscription');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(deletePayment).toHaveBeenCalledWith(chargeId);
  });

  it('uma falha ao apagar a cobrança não impede o cancelamento', async () => {
    const { api, firmId } = await activeFirmWithUpgradeCharge();
    vi.spyOn(billing, 'deletePayment').mockRejectedValue(new Error('Asaas fora'));

    const res = await api.delete('/billing/subscription');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await subscriptionRows(firmId))[0].status).toBe('CANCELED');
  });
});

/* Cada upgrade cria uma avulsa nova e o `persist` sobrescreve `pendingPaymentId`: a anterior
 * seguia pagável sem efeito claro para o cliente. Só a avulsa em aberto é apagada; uma
 * cobrança da assinatura nunca sai por este caminho. */
describe('novo upgrade apaga a cobrança avulsa anterior', () => {
  it('dois upgrades seguidos: a primeira avulsa é apagada no provider', async () => {
    const { api, firmId, chargeId } = await activeFirmWithUpgradeCharge();
    vi.spyOn(billing, 'payment').mockResolvedValue({ subscriptionId: null, open: true });
    const deletePayment = vi.spyOn(billing, 'deletePayment');

    const res = await api.post('/billing/checkout', { planName: 'escritorio', cycle: 'yearly' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(deletePayment).toHaveBeenCalledWith(chargeId);

    const [row] = await subscriptionRows(firmId);
    expect(row.pendingPaymentId).toMatch(/^mock_pay_/);
    expect(row.pendingPaymentId).not.toBe(chargeId);
  });

  it('cobrança da assinatura nunca é apagada por este caminho', async () => {
    const { api } = await activeFirmWithUpgradeCharge();
    vi.spyOn(billing, 'payment').mockResolvedValue({ subscriptionId: 'sub_da_firma', open: true });
    const deletePayment = vi.spyOn(billing, 'deletePayment');

    const res = await api.post('/billing/checkout', { planName: 'escritorio', cycle: 'yearly' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(deletePayment).not.toHaveBeenCalled();
  });

  it('avulsa já paga fica como está', async () => {
    const { api } = await activeFirmWithUpgradeCharge();
    vi.spyOn(billing, 'payment').mockResolvedValue({ subscriptionId: null, open: false });
    const deletePayment = vi.spyOn(billing, 'deletePayment');

    const res = await api.post('/billing/checkout', { planName: 'escritorio', cycle: 'yearly' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(deletePayment).not.toHaveBeenCalled();
  });

  it('falha ao consultar ou apagar a anterior não impede o novo upgrade', async () => {
    const { api, firmId, chargeId } = await activeFirmWithUpgradeCharge();
    vi.spyOn(billing, 'payment').mockRejectedValue(new Error('Asaas fora'));

    const res = await api.post('/billing/checkout', { planName: 'escritorio', cycle: 'yearly' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await subscriptionRows(firmId))[0].pendingPaymentId).not.toBe(chargeId);
  });
});

/* Postgres recusa NUL em `text`: o id criado no gateway não grava e o `persist` falha DEPOIS
 * de o Asaas já ter a assinatura (ou a cobrança). Sem saga, o que resta é registrar o id
 * órfão para limpar à mão no painel. */
const UNPERSISTABLE = '\u0000';

describe('checkout que cria no gateway e não grava registra o id órfão', () => {
  it('assinatura nova: log antes do persist, e log + Sentry com o subscriptionId na falha', async () => {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    const subscriptionId = `sub_orfa${UNPERSISTABLE}`;
    vi.spyOn(billing, 'createSubscription').mockResolvedValue({
      subscriptionId,
      paymentId: 'pay_orfa',
      checkoutUrl: '',
    });
    const info = vi.spyOn(Logger.prototype, 'log');
    const error = vi.spyOn(Logger.prototype, 'error');
    vi.mocked(Sentry.captureException).mockClear();

    const res = await api.post('/billing/checkout', { planName: 'profissional' });
    expect(res.status).toBe(500);

    const ids = { firmId, subscriptionId };
    expect(info).toHaveBeenCalledWith(expect.stringContaining(firmId), ids);
    expect(error).toHaveBeenCalledWith(expect.stringContaining(firmId), ids, expect.anything());
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.anything(), { extra: ids });
  });

  it('cobrança de upgrade: o mesmo com o paymentId', async () => {
    const { api, firmId } = await activeFirmWithUpgradeCharge();
    const paymentId = `pay_orfa${UNPERSISTABLE}`;
    vi.spyOn(billing, 'createCharge').mockResolvedValue({ paymentId, invoiceUrl: '' });
    const info = vi.spyOn(Logger.prototype, 'log');
    const error = vi.spyOn(Logger.prototype, 'error');
    vi.mocked(Sentry.captureException).mockClear();

    const res = await api.post('/billing/checkout', { planName: 'escritorio', cycle: 'yearly' });
    expect(res.status).toBe(500);

    const ids = { firmId, paymentId };
    expect(info).toHaveBeenCalledWith(expect.stringContaining(firmId), ids);
    expect(error).toHaveBeenCalledWith(expect.stringContaining(firmId), ids, expect.anything());
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.anything(), { extra: ids });
  });
});

describe('GET /billing/subscription — link da fatura só para o dono', () => {
  it('o dono vê o invoiceUrl gravado no checkout; o membro recebe null', async () => {
    const { api } = await registerFirm(app.url);
    const firmId = await firmIdOf(api);
    await setSubscription(firmId, {
      pendingPlanName: 'profissional',
      pendingInvoiceUrl: 'https://sandbox.asaas.com/i/pay_teste',
    });

    const owner = await api.get('/billing/subscription');
    expect(owner.body.data.invoiceUrl).toBe('https://sandbox.asaas.com/i/pay_teste');

    const member = await registerMember(api);
    const viaMember = await member.get('/billing/subscription');
    expect(viaMember.status).toBe(200);
    expect(viaMember.body.data).toMatchObject({
      pendingPlanName: 'profissional',
      invoiceUrl: null,
    });
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
    it(`${blockedState.label}: escrita → 402 PAYMENT_REQUIRED, leitura e checkout seguem`, async () => {
      await setSubscription(firmId, blockedState.patch);

      /* A rota que regulariza NÃO entra na régua: a firma bloqueada precisa alcançar o
       * checkout, senão fica trancada do lado de fora com o boleto na mão. */
      const checkout = await api.post('/billing/checkout', { planName: 'profissional' });
      expect(checkout.status, JSON.stringify(checkout.body)).toBe(201);

      const status = await api.get('/billing/subscription');
      expect(status.status).toBe(200);

      /* Guard roda antes do zodPipe: corpo inválido ainda é 402, não 422. */
      const write = await api.post('/periods', {});
      expect(write.status).toBe(402);
      expect(write.body.error).toEqual({
        code: 'PAYMENT_REQUIRED',
        message: 'Assinatura inativa. Regularize para continuar.',
      });

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

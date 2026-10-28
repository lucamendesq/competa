import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import env from '../src/config/env.js';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import { billingWebhookEvent, subscription } from '../src/infra/database/schema/index.js';
import { registerFirm, uniqueIp, type Api } from './support/fixtures.js';

/* A suíte de billing prende o 503 SEM segredo; esta roda COM ele. O `env` é lido a cada
 * requisição, então o token entra aqui e sai no `afterAll` sem reiniciar o processo. */
const TOKEN = 'teste-webhook-asaas';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  env.ASAAS_WEBHOOK_TOKEN = TOKEN;
  app = await bootApp();
});

afterAll(async () => {
  env.ASAAS_WEBHOOK_TOKEN = undefined;
  await app.close();
});

let eventSeq = 0;
const eventId = () => `evt_${Date.now().toString(36)}_${++eventSeq}`;

const post = (body: unknown, token: string | null = TOKEN) =>
  fetch(`${app.url}/billing/webhook/asaas`, {
    method: 'POST',
    headers: {
      'x-forwarded-for': uniqueIp(),
      'content-type': 'application/json',
      ...(token === null ? {} : { 'asaas-access-token': token }),
    },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => undefined) }));

async function firmIdOf(api: Api): Promise<string> {
  const res = await api.get('/auth/me');
  expect(res.status).toBe(200);
  return res.body.data.accountingFirm.id;
}

const rowOf = async (firmId: string) => {
  const [row] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.accountingFirmId, firmId));
  return row;
};

/** Firma com checkout feito: ganha gateway ids e a fatura pendente do LogBilling. */
async function firmWithCheckout(planName = 'profissional', cycle = 'monthly') {
  const { api } = await registerFirm(app.url);
  const firmId = await firmIdOf(api);
  const res = await api.post('/billing/checkout', { planName, cycle });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const row = await rowOf(firmId);
  return {
    api,
    firmId,
    gatewaySubscriptionId: row.gatewaySubscriptionId!,
    paymentId: row.pendingPaymentId!,
  };
}

describe('autenticação do webhook', () => {
  it('token ausente ou errado → 403 WEBHOOK não autorizado; nada processado', async () => {
    const { gatewaySubscriptionId, firmId } = await firmWithCheckout();
    const body = {
      id: eventId(),
      event: 'PAYMENT_CONFIRMED',
      payment: { subscription: gatewaySubscriptionId },
    };

    for (const token of [null, 'errado', TOKEN.toUpperCase()]) {
      const res = await post(body, token);
      expect(res.status, String(token)).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }

    expect((await rowOf(firmId)).status).toBe('trialing');
    const claimed = await db
      .select({ id: billingWebhookEvent.id })
      .from(billingWebhookEvent)
      .where(eq(billingWebhookEvent.id, body.id));
    expect(claimed).toEqual([]);
  });

  it('evento sem id e sem event → 200 inerte (só 200 conta como entregue para o Asaas)', async () => {
    const { gatewaySubscriptionId, firmId } = await firmWithCheckout();

    const noId = await post({
      event: 'PAYMENT_CONFIRMED',
      payment: { subscription: gatewaySubscriptionId },
    });
    expect(noId.status).toBe(200);

    const noEvent = await post({ id: eventId(), payment: { subscription: gatewaySubscriptionId } });
    expect(noEvent.status).toBe(200);

    expect((await rowOf(firmId)).status).toBe('trialing');
  });
});

describe('ciclo de vida pela fila do Asaas', () => {
  it('PAYMENT_CONFIRMED da fatura pendente ativa, promove e ancora o período no vencimento', async () => {
    const { firmId, gatewaySubscriptionId, paymentId } = await firmWithCheckout(
      'escritorio',
      'yearly',
    );

    const res = await post({
      id: eventId(),
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: paymentId,
        subscription: gatewaySubscriptionId,
        value: 2990,
        dueDate: '2026-11-03',
        paymentDate: null,
        externalReference: firmId,
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ data: { received: true } });

    const row = await rowOf(firmId);
    expect(row).toMatchObject({
      status: 'ACTIVE',
      planName: 'escritorio',
      cycle: 'yearly',
      pendingPlanName: null,
      pendingPaymentId: null,
      pendingInvoiceUrl: null,
    });
    expect(row.currentPeriodStart?.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(row.currentPeriodEnd?.toISOString()).toBe('2027-11-03T00:00:00.000Z');
  });

  it('o mesmo evento entregue duas vezes só conta uma', async () => {
    const { firmId, gatewaySubscriptionId, paymentId } = await firmWithCheckout();
    const body = {
      id: eventId(),
      event: 'PAYMENT_RECEIVED',
      payment: { id: paymentId, subscription: gatewaySubscriptionId, dueDate: '2026-11-03' },
    };

    expect((await post(body)).status).toBe(200);
    await db
      .update(subscription)
      .set({ status: 'OVERDUE' })
      .where(eq(subscription.accountingFirmId, firmId));

    const again = await post(body);
    expect(again.status, 'reenvio responde 200 para o Asaas parar de insistir').toBe(200);
    expect((await rowOf(firmId)).status, 'nada reprocessado').toBe('OVERDUE');
  });

  it('PAYMENT_RECEIVED atrasado de outra fatura ativa sem promover; o da fatura certa promove', async () => {
    const { firmId, gatewaySubscriptionId, paymentId } = await firmWithCheckout('profissional');

    await post({
      id: eventId(),
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_antiga',
        subscription: gatewaySubscriptionId,
        value: 119,
        dueDate: '2026-10-01',
      },
    });
    expect(await rowOf(firmId)).toMatchObject({
      status: 'ACTIVE',
      planName: 'trial',
      pendingPlanName: 'profissional',
    });

    await post({
      id: eventId(),
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: paymentId,
        subscription: gatewaySubscriptionId,
        value: 189,
        dueDate: '2026-11-01',
      },
    });
    expect(await rowOf(firmId)).toMatchObject({
      status: 'ACTIVE',
      planName: 'profissional',
      pendingPlanName: null,
    });
  });

  it('PAYMENT_OVERDUE do período corrente bloqueia; de fatura antiga é ignorado; SUBSCRIPTION_DELETED cancela', async () => {
    const { firmId, gatewaySubscriptionId, paymentId } = await firmWithCheckout();
    await post({
      id: eventId(),
      event: 'PAYMENT_CONFIRMED',
      payment: { id: paymentId, subscription: gatewaySubscriptionId, dueDate: '2026-11-01' },
    });

    const stale = await post({
      id: eventId(),
      event: 'PAYMENT_DELETED',
      payment: { id: 'pay_velha', subscription: gatewaySubscriptionId, dueDate: '2026-10-01' },
    });
    expect(stale.status).toBe(200);
    expect((await rowOf(firmId)).status).toBe('ACTIVE');

    await post({
      id: eventId(),
      event: 'PAYMENT_OVERDUE',
      payment: { id: 'pay_nova', subscription: gatewaySubscriptionId, dueDate: '2026-12-01' },
    });
    expect((await rowOf(firmId)).status).toBe('OVERDUE');

    await post({
      id: eventId(),
      event: 'SUBSCRIPTION_DELETED',
      subscription: { id: gatewaySubscriptionId, externalReference: firmId },
    });
    expect((await rowOf(firmId)).status).toBe('CANCELED');
  });

  it('cobrança avulsa sem subscription acha a firma pelo externalReference', async () => {
    const { firmId } = await firmWithCheckout();

    await post({
      id: eventId(),
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_avulsa', value: 70, dueDate: '2026-11-01', externalReference: firmId },
    });
    expect((await rowOf(firmId)).status).toBe('ACTIVE');
  });
});

describe('throttle do webhook', () => {
  /* O balde curto global (30/10s) derrubava a rajada do dia 1 com 429 — e 15 falhas seguidas
   * pausam a fila do Asaas. Só o balde sustentado vale aqui. */
  it('40 eventos do mesmo IP em sequência passam sem 429', async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const res = await fetch(`${app.url}/billing/webhook/asaas`, {
        method: 'POST',
        headers: {
          'x-forwarded-for': ip,
          'content-type': 'application/json',
          'asaas-access-token': TOKEN,
        },
        body: JSON.stringify({
          id: eventId(),
          event: 'PAYMENT_BANK_SLIP_VIEWED',
          payment: { subscription: 'sub_x' },
        }),
      });
      statuses.push(res.status);
      expect(res.headers.get('x-ratelimit-limit-short'), 'sem balde curto').toBeNull();
    }
    expect(
      statuses.every((status) => status === 200),
      statuses.join(','),
    ).toBe(true);
  });
});

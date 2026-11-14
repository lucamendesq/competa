import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsaasBilling } from '../../src/modules/billing/providers/asaas-billing.provider.js';

const NOW = new Date('2026-11-13T12:00:00Z');

function stubAsaas() {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (init?.method === 'POST' && url.endsWith('/subscriptions')) {
        bodies.push(JSON.parse(init.body as string));
        return json({ id: 'sub_1' });
      }
      return json({ data: [{ id: 'pay_1', invoiceUrl: 'https://www.asaas.com/i/pay_1' }] });
    }),
  );
  return bodies;
}

const input = {
  customerId: 'cus_1',
  planName: 'profissional',
  cycle: 'monthly' as const,
  value: 189,
  externalReference: 'firm_1',
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AsaasBilling.createSubscription — vencimento da primeira cobrança', () => {
  it('sem firstDueDate, vence em 3 dias', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const bodies = stubAsaas();

    await new AsaasBilling().createSubscription(input);
    expect(bodies[0].nextDueDate).toBe('2026-11-16');
  });

  it('com firstDueDate, vence nele', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const bodies = stubAsaas();

    await new AsaasBilling().createSubscription({
      ...input,
      firstDueDate: new Date('2026-12-16T00:00:00Z'),
    });
    expect(bodies[0].nextDueDate).toBe('2026-12-16');
  });
});

describe('AsaasBilling.changeSubscriptionPlan — realinhar a fatura em aberto', () => {
  const change = {
    planName: 'escritorio',
    cycle: 'monthly' as const,
    value: 299,
    nextDueDate: new Date('2026-12-24T00:00:00Z'),
  };

  function stubGateway(payments: unknown[], failPaymentPut = false) {
    const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({
          method,
          url,
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        if (method === 'PUT' && url.includes('/payments/') && failPaymentPut) {
          return new Response('{}', { status: 400 });
        }
        return new Response(JSON.stringify({ data: payments }), { status: 200 });
      }),
    );
    return calls;
  }

  const paymentPuts = (calls: { method: string; url: string; body?: Record<string, unknown> }[]) =>
    calls.filter((call) => call.method === 'PUT' && call.url.includes('/payments/'));

  it('vencimento diferente: PUT /payments/{id} com o billingType da própria fatura', async () => {
    const calls = stubGateway([
      { id: 'pay_1', status: 'PENDING', dueDate: '2026-12-04', billingType: 'BOLETO' },
    ]);

    await new AsaasBilling().changeSubscriptionPlan('sub_1', change);

    const puts = paymentPuts(calls);
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toMatch(/\/payments\/pay_1$/);
    expect(puts[0].body).toEqual({ billingType: 'BOLETO', value: 299, dueDate: '2026-12-24' });
  });

  it('vencimento já igual, sem fatura em aberto ou sem nextDueDate: nenhum PUT /payments', async () => {
    const same = stubGateway([
      { id: 'pay_1', status: 'PENDING', dueDate: '2026-12-24', billingType: 'UNDEFINED' },
    ]);
    await new AsaasBilling().changeSubscriptionPlan('sub_1', change);
    expect(paymentPuts(same)).toHaveLength(0);

    const none = stubGateway([
      { id: 'pay_0', status: 'RECEIVED', dueDate: '2026-11-04', billingType: 'UNDEFINED' },
    ]);
    await new AsaasBilling().changeSubscriptionPlan('sub_1', change);
    expect(paymentPuts(none)).toHaveLength(0);

    const noDate = stubGateway([
      { id: 'pay_1', status: 'PENDING', dueDate: '2026-12-04', billingType: 'UNDEFINED' },
    ]);
    await new AsaasBilling().changeSubscriptionPlan('sub_1', { ...change, nextDueDate: undefined });
    expect(noDate).toHaveLength(1);
  });

  it('PUT /payments falhando não lança: a promoção do plano não pode desfazer', async () => {
    stubGateway([{ id: 'pay_1', status: 'PENDING', dueDate: '2026-12-04' }], true);

    await expect(
      new AsaasBilling().changeSubscriptionPlan('sub_1', change),
    ).resolves.toBeUndefined();
  });
});

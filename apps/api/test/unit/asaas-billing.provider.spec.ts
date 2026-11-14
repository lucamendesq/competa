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

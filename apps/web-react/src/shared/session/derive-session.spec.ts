import { describe, expect, it } from 'vitest';
import { deriveSession, subscriptionOverdue } from '@/shared/session';
import { accountantSession } from '@/testing/factories/session';

const now = new Date('2026-11-07T12:00:00.000Z');
const subscription = (overrides: Record<string, unknown>) => ({
  status: 'ACTIVE',
  planName: 'essencial',
  cycle: 'monthly' as const,
  trialEndsAt: null,
  currentPeriodEnd: null,
  priceOverride: null,
  ...overrides,
});

describe('subscriptionOverdue', () => {
  it('OVERDUE é inadimplente', () => {
    expect(subscriptionOverdue(subscription({ status: 'OVERDUE' }), now)).toBe(true);
  });

  it('CANCELED só bloqueia depois do fim do período pago', () => {
    expect(
      subscriptionOverdue(
        subscription({ status: 'CANCELED', currentPeriodEnd: '2026-11-01T00:00:00Z' }),
        now,
      ),
    ).toBe(true);
    expect(
      subscriptionOverdue(
        subscription({ status: 'CANCELED', currentPeriodEnd: '2026-12-01T00:00:00Z' }),
        now,
      ),
    ).toBe(false);
    expect(subscriptionOverdue(subscription({ status: 'CANCELED' }), now)).toBe(true);
  });

  it('trial vencido é inadimplente, trial em curso não', () => {
    expect(
      subscriptionOverdue(
        subscription({ status: 'trialing', trialEndsAt: '2026-11-01T00:00:00Z' }),
        now,
      ),
    ).toBe(true);
    expect(
      subscriptionOverdue(
        subscription({ status: 'trialing', trialEndsAt: '2026-11-21T00:00:00Z' }),
        now,
      ),
    ).toBe(false);
  });

  it('assinatura ativa ou ausente não é inadimplente', () => {
    expect(subscriptionOverdue(subscription({}), now)).toBe(false);
    expect(subscriptionOverdue(undefined, now)).toBe(false);
  });
});

describe('deriveSession', () => {
  it('can() é false enquanto o /me não voltou', () => {
    const session = deriveSession({ status: 'loading', accountant: null, contact: null });

    expect(session.can('reminderTuning')).toBe(false);
    expect(session.isOwner).toBe(false);
  });

  it('can() lê as capabilities do plano', () => {
    const me = accountantSession();
    me.accountingFirm.plan.capabilities = ['reminderTuning'] as never[];
    const session = deriveSession({ status: 'ready', accountant: me as never, contact: null });

    expect(session.can('reminderTuning')).toBe(true);
    expect(session.can('branding')).toBe(false);
    expect(session.isOwner).toBe(true);
  });
});

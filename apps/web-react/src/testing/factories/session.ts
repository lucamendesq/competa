import { uuid } from '@/testing/factories/ids';

export const accountantSession = () => ({
  accountant: { id: uuid(), name: 'Ana Dono', email: 'dono@exemplo.com.br', owner: true },
  accountingFirm: {
    id: uuid(),
    name: 'Contabilidade Exemplo',
    logoUrl: null,
    contactEmail: null,
    cnpj: null,
    plan: { name: 'trial', companyCap: 15, capabilities: [] },
    subscription: {
      status: 'trialing',
      planName: 'trial',
      cycle: 'monthly',
      trialEndsAt: '2026-11-21T00:00:00.000Z',
      currentPeriodEnd: null,
      priceOverride: null,
    },
  },
});

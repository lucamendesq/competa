import type { CompanySummaryResponse } from '@competa/contracts';
import { uuid } from '@/testing/factories/ids';

export const company = (
  overrides: Partial<CompanySummaryResponse> = {},
): CompanySummaryResponse => ({
  id: uuid(),
  name: 'Mercado Bom Preço',
  cnpj: '11222333000181',
  flags: { has_employees: false, accepts_card_payments: false, has_inventory: false },
  active: true,
  checklistTemplateId: null,
  templateName: null,
  responsibleAccountantId: null,
  responsibleAccountantName: null,
  contactCount: 0,
  contacts: [],
  readyContactCount: 0,
  ...overrides,
});

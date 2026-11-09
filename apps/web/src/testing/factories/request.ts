import type { RequestDetailResponse } from '@competa/contracts';
import { uuid } from '@/testing/factories/ids';

export const request = (overrides: Partial<RequestDetailResponse> = {}): RequestDetailResponse => ({
  id: uuid(),
  status: 'open',
  closedAt: null,
  companyId: uuid(),
  companyName: 'Mercado Bom Preço',
  periodId: uuid(),
  referenceMonth: '2026-11-01',
  periodDueDate: '2026-11-12',
  items: [],
  extraDocuments: [],
  ...overrides,
});

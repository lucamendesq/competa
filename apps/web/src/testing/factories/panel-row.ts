import type { PanelRowResponse } from '@competa/contracts';
import { uuid } from '@/testing/factories/ids';

export const panelRow = (overrides: Partial<PanelRowResponse> = {}): PanelRowResponse => ({
  companyId: uuid(),
  companyName: 'Mercado Bom Preço',
  responsibleAccountantId: null,
  responsibleAccountantName: null,
  requestId: uuid(),
  requestStatus: 'open',
  counts: { pending: 1, submitted: 0, accepted: 0, rejected: 0 },
  missing: [],
  channelFailures: [],
  ...overrides,
});

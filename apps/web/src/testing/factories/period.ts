import type { PeriodSummaryResponse } from '@competa/contracts';
import { uuid } from '@/testing/factories/ids';

export const period = (overrides: Partial<PeriodSummaryResponse> = {}): PeriodSummaryResponse => ({
  id: uuid(),
  referenceMonth: '2026-11-01',
  status: 'open',
  dueDate: '2026-11-12',
  requestCount: 0,
  createdAt: '2026-11-07T06:00:00.000Z',
  ...overrides,
});

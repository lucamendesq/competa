import { api } from '@/shared/lib/api-client';
import type { Period } from '@/features/periods/api/period.types';

export type PeriodListParams = { page: number; perPage: number };

export const getPeriods = (params: PeriodListParams, signal?: AbortSignal) =>
  api.page<Period>('/periods', { params, ...(signal ? { signal } : {}) });

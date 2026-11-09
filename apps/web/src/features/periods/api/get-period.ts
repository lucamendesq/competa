import { api } from '@/shared/lib/api-client';
import type { PeriodDetail } from '@/features/periods/api/period.types';

export const getPeriod = (id: string, signal?: AbortSignal) =>
  api.get<PeriodDetail>(`/periods/${id}`, signal ? { signal } : {});

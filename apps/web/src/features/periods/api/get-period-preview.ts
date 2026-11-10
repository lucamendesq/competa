import { api } from '@/shared/lib/api-client';
import type { PeriodPreview } from '@/features/periods/api/period.types';

export const getPeriodPreview = (referenceMonth: string, signal?: AbortSignal) =>
  api.get<PeriodPreview>('/periods/preview', {
    params: { referenceMonth },
    ...(signal ? { signal } : {}),
  });

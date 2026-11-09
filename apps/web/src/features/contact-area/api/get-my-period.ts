import { api } from '@/shared/lib/api-client';
import type { MyPeriodDetail } from '@/features/contact-area/api/contact-area.types';

export const getMyPeriod = (periodId: string, companyId: string, signal?: AbortSignal) =>
  api.get<MyPeriodDetail>(`/my/periods/${periodId}`, {
    params: { companyId },
    ...(signal ? { signal } : {}),
  });

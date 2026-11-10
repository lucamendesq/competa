import { api } from '@/shared/lib/api-client';
import type { PeriodClosing } from '@/features/periods/api/period.types';

export const closePeriod = (id: string) => api.post<PeriodClosing>(`/periods/${id}/close`);

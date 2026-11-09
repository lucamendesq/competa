import { api } from '@/shared/lib/api-client';
import type { PeriodOpening } from '@/features/periods/api/period.types';

export const addMissingRequests = (id: string) =>
  api.post<Pick<PeriodOpening, 'warnings' | 'requests'>>(`/periods/${id}/requests`);

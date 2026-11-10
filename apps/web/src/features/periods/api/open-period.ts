import { api } from '@/shared/lib/api-client';
import type { PeriodOpening } from '@/features/periods/api/period.types';

export type OpenPeriodInput = { referenceMonth: string; dueDate?: string };

export const openPeriod = (body: OpenPeriodInput) => api.post<PeriodOpening>('/periods', body);

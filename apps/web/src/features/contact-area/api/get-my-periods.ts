import { api } from '@/shared/lib/api-client';
import type { MyPeriod } from '@/features/contact-area/api/contact-area.types';

export const getMyPeriods = (page: number, perPage: number, signal?: AbortSignal) =>
  api.page<MyPeriod>('/my/periods', { params: { page, perPage }, ...(signal ? { signal } : {}) });

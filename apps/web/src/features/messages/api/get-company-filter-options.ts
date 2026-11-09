import { api } from '@/shared/lib/api-client';
import type { CompanyFilterOption } from '@/features/messages/api/message.types';

export const getCompanyFilterOptions = (signal?: AbortSignal) =>
  api.page<CompanyFilterOption>('/companies', {
    params: { page: 1, perPage: 100, active: 'true' },
    ...(signal ? { signal } : {}),
  });

import { api } from '@/shared/lib/api-client';
import type { CompanyDetail } from '@/features/companies/api/company.types';

export const getCompany = (id: string, signal?: AbortSignal) =>
  api.get<CompanyDetail>(`/companies/${id}`, signal ? { signal } : {});

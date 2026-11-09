import { api } from '@/shared/lib/api-client';
import type { Company } from '@/features/companies/api/company.types';

export type CompanyListFilters = {
  page: number;
  perPage: number;
  active?: string;
  search?: string;
};

export const getCompanies = (filters: CompanyListFilters, signal?: AbortSignal) =>
  api.page<Company>('/companies', { params: filters, ...(signal ? { signal } : {}) });

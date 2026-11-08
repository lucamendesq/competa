import type { CompanyListFilters } from '@/features/companies/api/get-companies';

export const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  list: (filters: CompanyListFilters) => [...companyKeys.lists(), filters] as const,
  details: () => [...companyKeys.all, 'detail'] as const,
  detail: (id: string) => [...companyKeys.details(), id] as const,
  accesses: (id: string) => [...companyKeys.all, 'accesses', id] as const,
  checklist: (id: string) => [...companyKeys.all, 'checklist', id] as const,
  overrides: (id: string) => [...companyKeys.all, 'overrides', id] as const,
  usage: () => [...companyKeys.all, 'usage'] as const,
  accountantOptions: () => [...companyKeys.all, 'accountant-options'] as const,
};

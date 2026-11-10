import type { CreateCompanyBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { CompanyDetail } from '@/features/companies/api/company.types';

export const createCompany = (body: CreateCompanyBody) =>
  api.post<CompanyDetail>('/companies', body);

import type { UpdateCompanyBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { Company } from '@/features/companies/api/company.types';

export const updateCompany = (id: string, body: UpdateCompanyBody) =>
  api.patch<Company>(`/companies/${id}`, body);

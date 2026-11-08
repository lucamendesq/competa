import { api } from '@/shared/lib/api-client';
import type { Company } from '@/features/companies/api/company.types';

export const deactivateCompany = (id: string) => api.delete<Company>(`/companies/${id}`);

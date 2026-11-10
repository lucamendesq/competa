import type { CompanySummaryResponse } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';

export const getCompanyCnpjs = async (signal?: AbortSignal) => {
  const page = await api.page<CompanySummaryResponse>('/companies', {
    params: { page: 1, perPage: 100 },
    ...(signal ? { signal } : {}),
  });
  return new Map(
    page.data.flatMap((company) => (company.cnpj ? [[company.id, company.cnpj] as const] : [])),
  );
};

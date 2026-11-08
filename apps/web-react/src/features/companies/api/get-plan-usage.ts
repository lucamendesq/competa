import { api } from '@/shared/lib/api-client';
import type { PlanUsage } from '@/features/companies/api/company.types';

export const getPlanUsage = (signal?: AbortSignal) =>
  api.get<PlanUsage>('/companies/usage', signal ? { signal } : {});

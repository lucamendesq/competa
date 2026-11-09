import { api } from '@/shared/lib/api-client';
import type { PlanUsage } from '@/features/billing/api/billing.types';

export const getPlanUsage = (signal?: AbortSignal) =>
  api.get<PlanUsage>('/companies/usage', signal ? { signal } : {});

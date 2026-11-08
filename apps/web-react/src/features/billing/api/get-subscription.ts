import { api } from '@/shared/lib/api-client';
import type { BillingSubscription } from '@/features/billing/api/billing.types';

export const getSubscription = (signal?: AbortSignal) =>
  api.get<BillingSubscription>('/billing/subscription', signal ? { signal } : {});

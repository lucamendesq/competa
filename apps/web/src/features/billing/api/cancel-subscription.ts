import { api } from '@/shared/lib/api-client';

export const cancelSubscription = () =>
  api.delete<{ status: 'CANCELED'; currentPeriodEnd: string | null }>('/billing/subscription');

import { api } from '@/shared/lib/api-client';
import type { PushSubscriptionPayload } from '@/shared/pwa';

export const subscribePush = (token: string, subscription: PushSubscriptionPayload) =>
  api.post<{ id: string }>(`/upload/${token}/push`, subscription);

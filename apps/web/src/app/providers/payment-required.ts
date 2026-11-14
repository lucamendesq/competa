import type { QueryClient } from '@tanstack/react-query';
import { authKeys } from '@/features/auth';
import { onPaymentRequired } from '@/shared/lib/api-client';

export const registerPaymentRequiredRefresh = (queryClient: QueryClient) =>
  onPaymentRequired(() => {
    void queryClient.invalidateQueries({ queryKey: authKeys.me() });
  });

import type { CheckoutBody } from '@competa/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelSubscription } from '@/features/billing/api/cancel-subscription';
import { checkout } from '@/features/billing/api/checkout';
import { getPlanUsage } from '@/features/billing/api/get-plan-usage';
import { getSubscription } from '@/features/billing/api/get-subscription';
import { billingKeys } from '@/features/billing/queries/billing-keys';
import { useSession } from '@/shared/session';

export const useSubscription = () =>
  useQuery({
    queryKey: billingKeys.subscription(),
    queryFn: ({ signal }) => getSubscription(signal),
  });

export const useBillingUsage = () =>
  useQuery({ queryKey: billingKeys.usage(), queryFn: ({ signal }) => getPlanUsage(signal) });

const useRefreshBilling = () => {
  const queryClient = useQueryClient();
  const session = useSession();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: billingKeys.subscription() }),
      session.refresh(),
    ]);
};

export const useCheckout = () => {
  const refresh = useRefreshBilling();
  return useMutation({
    mutationFn: (body: CheckoutBody) => checkout(body),
    onSuccess: async (result) => {
      if (result.applied || result.scheduled || result.simulated || !result.checkoutUrl) {
        await refresh();
      }
    },
  });
};

export const useCancelSubscription = () => {
  const refresh = useRefreshBilling();
  return useMutation({ mutationFn: cancelSubscription, onSuccess: refresh });
};

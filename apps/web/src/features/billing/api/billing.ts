import { api } from '@/api/client';
import type { BillingCycle, CheckoutBody } from '@competa/contracts';

export type SubscriptionStatusResponse = {
  planName: string;
  cycle: BillingCycle;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  pendingPlanName: string | null;
  pendingCycle: BillingCycle | null;
  /** Link da fatura em aberto no Asaas (só o dono recebe): é por ele que se paga. */
  invoiceUrl: string | null;
};

/** `applied`: a troca valeu na hora (preço igual ou menor com assinatura em dia) — não há o
 *  que pagar. `checkoutUrl` nulo sem `applied`: a troca vale na próxima fatura. */
export type CheckoutResponse = {
  checkoutUrl: string | null;
  simulated: boolean;
  applied: boolean;
};

export type CancelResponse = { status: 'CANCELED'; currentPeriodEnd: string | null };

export const getSubscription = () => api.get<SubscriptionStatusResponse>('/billing/subscription');

export const checkout = (body: CheckoutBody) =>
  api.post<CheckoutResponse>('/billing/checkout', body);

export const cancelSubscription = () => api.delete<CancelResponse>('/billing/subscription');

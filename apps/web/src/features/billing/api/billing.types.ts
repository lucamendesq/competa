import type { BillingCycle } from '@competa/contracts';
import type { PlanCapUsage } from '@/shared/components/plan-cap-banner';

export type BillingSubscription = {
  planName: string;
  cycle: BillingCycle;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  pendingPlanName: string | null;
  pendingCycle: BillingCycle | null;
  scheduledPlanName: string | null;
  scheduledCycle: BillingCycle | null;
  scheduledAt: string | null;
  invoiceUrl: string | null;
};

export type CheckoutResult = {
  checkoutUrl: string | null;
  simulated: boolean;
  applied: boolean;
  scheduled: boolean;
};

export type PlanUsage = PlanCapUsage & { companiesInactive: number };

import { PLANS, type PaidPlanName, type PlanName } from '@competa/contracts';
import { Link } from 'react-router';
import { Callout } from '@/shared/components/callout';
import { brl } from '@/shared/lib/format';

export type PlanCapUsage = {
  planName: string;
  companiesActive: number;
  companyCap: number;
  softCap: number;
  overCap: boolean;
  recommendedPlan: PaidPlanName;
};

export function PlanCapBanner({
  usage,
  className,
}: {
  usage: PlanCapUsage | undefined;
  className?: string;
}) {
  if (!usage?.overCap) return null;

  const { planName, companiesActive, companyCap, softCap, recommendedPlan } = usage;
  const currentPlan = PLANS[planName as PlanName] ?? PLANS.trial;
  const recommended = PLANS[recommendedPlan];

  return (
    <Callout
      tone="warning"
      heading="Você passou do teto do seu plano"
      {...(className ? { className } : {})}
      actions={
        <Link
          to={`/configuracoes/plano?plano=${recommendedPlan}`}
          className="self-center rounded-md border border-warning-border px-3 py-1.5 text-sm font-semibold whitespace-nowrap underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Ver o {recommended.label}
        </Link>
      }
    >
      <p>
        Você tem <strong>{companiesActive} empresas ativas</strong> e o {currentPlan.label} cobre{' '}
        {companyCap}. O cadastro continua liberado até {softCap} empresas ativas.
      </p>
      <p className="mt-1">
        O {recommended.label} sai a {brl(recommended.priceMonthly / recommended.companyCap)} por
        empresa — cobre até {recommended.companyCap}.
      </p>
    </Callout>
  );
}

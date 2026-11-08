import { PLANS, type PlanName } from '@competa/contracts';
import { Link } from 'react-router';
import { usePlanUsage } from '@/features/companies/queries/use-company-queries';
import { Callout } from '@/shared/components/callout';
import { brl } from '@/shared/lib/format';

export function PlanCapBanner({ className }: { className?: string }) {
  const usage = usePlanUsage();
  if (!usage.data?.overCap) return null;

  const { planName, companiesActive, companyCap, softCap, recommendedPlan } = usage.data;
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

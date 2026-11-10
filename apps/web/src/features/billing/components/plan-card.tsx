import { planPrice, type BillingCycle, type PaidPlanName, type Plan } from '@competa/contracts';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { brl } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

export type PriceOverride = Partial<Record<PaidPlanName, number>> | null;

export const monthlyOf = (plan: Plan, override: PriceOverride) =>
  override?.[plan.name as PaidPlanName] ?? plan.priceMonthly;

type PlanCardProps = {
  plan: Plan;
  cycle: BillingCycle;
  override: PriceOverride;
  highlighted: boolean;
  current: boolean;
  disabled: boolean;
  pending: boolean;
  onSubscribe: () => void;
};

export function PlanCard({
  plan,
  cycle,
  override,
  highlighted,
  current,
  disabled,
  pending,
  onSubscribe,
}: PlanCardProps) {
  const yearly = cycle === 'yearly';
  const founderPrice = override?.[plan.name as PaidPlanName];
  const price = planPrice(plan, cycle, founderPrice);

  return (
    <Card
      className={cn(
        'border relative flex flex-col transition-all duration-150 rounded-xl',
        highlighted
          ? 'border-primary ring-2 ring-primary/20 shadow-md'
          : 'border-border hover:border-primary/50 shadow-sm',
      )}
    >
      {highlighted ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow-xs tracking-wide">
          Recomendado
        </div>
      ) : null}
      <CardHeader>
        <CardTitle className="font-display">Plano {plan.label}</CardTitle>
        <CardDescription>{plan.pitch}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-3xl font-bold font-display text-foreground">
          {brl(price)}
          <span className="text-sm font-normal text-muted-foreground font-sans">
            {yearly ? '/ano' : '/mês'}
          </span>
        </p>
        {yearly ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Equivale a {brl(price / 12)}/mês — economia de{' '}
            <strong>{brl(monthlyOf(plan, override) * 12 - price)}</strong> no ano.
          </p>
        ) : null}
        {founderPrice ? (
          <p className="mt-1 text-sm font-semibold text-primary">
            Preço de fundador, vitalício (público: {brl(planPrice(plan, cycle))}
            {yearly ? '/ano' : '/mês'}).
          </p>
        ) : null}
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {plan.highlights.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" /> {item}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled={disabled || current} onClick={onSubscribe}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {current ? 'Plano atual' : `Assinar ${plan.label}`}
        </Button>
      </CardFooter>
    </Card>
  );
}

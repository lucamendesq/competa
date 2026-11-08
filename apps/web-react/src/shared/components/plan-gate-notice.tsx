import type { ReactNode } from 'react';
import { PLANS, planRequiredFor, type PlanCapability } from '@competa/contracts';
import { Lock } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/shared/lib/cn';

type PlanGateNoticeProps = { capability: PlanCapability; className?: string; children?: ReactNode };

export function PlanGateNotice({ capability, className, children }: PlanGateNoticeProps) {
  const plan = PLANS[planRequiredFor(capability)];

  return (
    <p className={cn('text-muted-foreground flex items-center gap-1.5 text-xs', className)}>
      <Lock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {children ?? 'Este recurso'} está disponível a partir do plano{' '}
        <strong className="text-foreground">{plan.label}</strong>.{' '}
        <Link
          to={{ pathname: '/configuracoes/plano', search: `?plano=${plan.name}` }}
          className="text-primary font-medium underline underline-offset-2"
        >
          Ver planos
        </Link>
      </span>
    </p>
  );
}

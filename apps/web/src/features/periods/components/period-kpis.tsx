import { ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router';
import type { Period } from '@/features/periods/api/period.types';
import { usePeriodDetail } from '@/features/periods/queries/use-period-queries';
import { Button } from '@/shared/components/ui/button';
import { monthLabel } from '@/shared/lib/format';

const latestOpen = (periods: Period[]) =>
  periods
    .filter((row) => row.status === 'open')
    .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))[0];

function Progress({ periodId }: { periodId: string }) {
  const detail = usePeriodDetail(periodId);

  if (detail.isPending) return <>Carregando andamento...</>;
  if (detail.isError) return null;
  return (
    <>
      <span className="font-display font-semibold text-foreground tabular-nums">
        {detail.data.completeRequestCount}
      </span>
      de
      <span className="font-display font-semibold text-foreground tabular-nums">
        {detail.data.requestCount}
      </span>
      entregues
    </>
  );
}

export function PeriodKpis({ periods }: { periods: Period[] }) {
  const current = latestOpen(periods);
  if (!current) return null;
  const panelPath = `/competencias/${current.id}/pendencias`;

  return (
    <div className="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Competência ativa
          </span>
        </div>
        <h2 className="text-foreground font-display text-xl sm:text-2xl font-bold tracking-tight">
          Competência atual: {monthLabel(current.referenceMonth)}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm flex items-center gap-1.5">
          <Progress periodId={current.id} />
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <Button variant="outline" asChild className="shadow-xs">
          <Link to={panelPath}>
            <Clock className="mr-2 h-4 w-4" aria-hidden="true" /> Cobrar pendentes
          </Link>
        </Button>
        <Button asChild className="shadow-xs font-medium">
          <Link to={panelPath}>
            <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" /> Ver painel
          </Link>
        </Button>
      </div>
    </div>
  );
}

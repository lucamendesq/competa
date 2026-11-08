import { History } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { MyPeriod } from '@/features/contact-area/api/contact-area.types';
import { PeriodCard } from '@/features/contact-area/components/period-card';
import { HISTORY_PER_PAGE, useMyPeriods } from '@/features/contact-area/queries/use-contact-area';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { Button } from '@/shared/components/ui/button';

const selectionOf = (row: MyPeriod) => `${row.periodId}:${row.companyId}`;

export function ContactHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const selected = searchParams.get('periodo');
  const periods = useMyPeriods(page);

  const update = (changes: Record<string, string | null>) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });

  const renderBody = () => {
    if (periods.isPending) return <LoadingRows count={4} />;
    if (periods.isError) {
      return (
        <ErrorState
          error={periods.error}
          fallback="Confira sua conexão e tente de novo."
          retry={() => void periods.refetch()}
        />
      );
    }
    if (periods.data.data.length === 0) {
      return (
        <div className="bg-card border-border rounded-xl border p-12 text-center text-sm text-muted-foreground shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <History className="size-6" aria-hidden="true" />
          </div>
          <p className="font-medium text-foreground">Nenhuma competência por aqui ainda.</p>
        </div>
      );
    }
    const pageCount = Math.max(1, Math.ceil(periods.data.meta.total / HISTORY_PER_PAGE));
    return (
      <>
        <ul className="flex flex-col gap-3">
          {periods.data.data.map((row) => (
            <PeriodCard
              key={row.requestId}
              row={row}
              expanded={selected === selectionOf(row)}
              onToggle={() =>
                update({ periodo: selected === selectionOf(row) ? null : selectionOf(row) })
              }
            />
          ))}
        </ul>
        {pageCount > 1 ? (
          <nav
            className="flex items-center justify-between gap-3"
            aria-label="Paginação do histórico"
          >
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1), periodo: null })}
            >
              Mais recentes
            </Button>
            <span className="text-muted-foreground text-xs">
              Página {page} de {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => update({ page: String(page + 1), periodo: null })}
            >
              Anteriores
            </Button>
          </nav>
        ) : null}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
          Histórico
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Consulte as competências anteriores e os documentos enviados pela sua empresa.
        </p>
      </div>
      {renderBody()}
    </div>
  );
}

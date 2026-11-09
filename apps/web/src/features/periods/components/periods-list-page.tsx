import { useState } from 'react';
import { planGateMessage } from '@competa/contracts';
import { CalendarPlus } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { Period } from '@/features/periods/api/period.types';
import { OpenPeriodDialog } from '@/features/periods/components/open-period-dialog';
import { PeriodKpis } from '@/features/periods/components/period-kpis';
import { PeriodsTable } from '@/features/periods/components/periods-table';
import {
  useClosePeriod,
  useDownloadPeriodZip,
} from '@/features/periods/queries/use-period-mutations';
import { usePeriods } from '@/features/periods/queries/use-period-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { Modal } from '@/shared/components/modal';
import { PageHeader } from '@/shared/components/page-header';
import { PlanGateNotice } from '@/shared/components/plan-gate-notice';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/ui/empty';
import { Pagination } from '@/shared/components/ui/pagination';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { cn } from '@/shared/lib/cn';
import { monthLabel } from '@/shared/lib/format';
import { useSession } from '@/shared/session';

const PER_PAGE = 20;

const STATUS_FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'open', label: 'Abertas' },
  { value: 'closed', label: 'Encerradas' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

const statusFilterOf = (value: string | null): StatusFilter =>
  value === 'open' || value === 'closed' ? value : 'todas';

export function PeriodsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const statusFilter = statusFilterOf(searchParams.get('status'));
  const [openingDialog, setOpeningDialog] = useState(false);
  const [closing, setClosing] = useState<Period | null>(null);

  const session = useSession();
  const canPeriodZip = session.can('periodZip');
  const periods = usePeriods({ page, perPage: PER_PAGE });
  const closePeriod = useClosePeriod();
  const downloadZip = useDownloadPeriodZip();

  const setParam = (key: string, value: string | null) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });

  const onDownloadZip = (period: Period) =>
    downloadZip
      .mutateAsync({ periodId: period.id, referenceMonth: period.referenceMonth })
      .then(() =>
        toast.success(`Download da competência ${monthLabel(period.referenceMonth)} concluído.`),
      )
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.')),
      );

  const confirmClose = (period: Period) =>
    closePeriod
      .mutateAsync(period.id)
      .then((closed) => toast.success(closed.warning ?? 'Competência encerrada.'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível encerrar a competência.')),
      )
      .finally(() => setClosing(null));

  const renderBody = () => {
    if (periods.isPending) return <LoadingRows />;
    if (periods.isError)
      return <ErrorState error={periods.error} retry={() => void periods.refetch()} />;
    if (periods.data.data.length === 0) {
      return (
        <EmptyState
          title="Nenhuma competência aberta"
          description="Abra a primeira competência para solicitar os documentos às suas empresas."
          icon={CalendarPlus}
          actionLabel="Abrir competência"
          onAction={() => setOpeningDialog(true)}
        />
      );
    }

    const rows = [...periods.data.data].sort((a, b) =>
      b.referenceMonth.localeCompare(a.referenceMonth),
    );
    const counts: Record<StatusFilter, number> = {
      todas: rows.length,
      open: rows.filter((row) => row.status === 'open').length,
      closed: rows.filter((row) => row.status === 'closed').length,
    };
    const visible =
      statusFilter === 'todas' ? rows : rows.filter((row) => row.status === statusFilter);
    const pageCount = Math.ceil(periods.data.meta.total / PER_PAGE);

    return (
      <>
        <PeriodKpis periods={rows} />

        <div
          className="mb-5 flex gap-2 overflow-x-auto pb-2"
          role="group"
          aria-label="Filtrar por status"
        >
          {STATUS_FILTERS.map((chip) => {
            const active = statusFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                aria-pressed={active}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary font-semibold shadow-xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onClick={() => setParam('status', chip.value === 'todas' ? null : chip.value)}
              >
                {chip.label}
                <span
                  className={cn(
                    'ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                    active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {counts[chip.value]}
                </span>
              </button>
            );
          })}
        </div>

        <PeriodsTable
          periods={visible}
          canPeriodZip={canPeriodZip}
          periodZipHint={planGateMessage('periodZip')}
          zipPendingFor={downloadZip.isPending ? (downloadZip.variables?.periodId ?? null) : null}
          onDownloadZip={onDownloadZip}
          onClose={setClosing}
        />

        {pageCount > 1 ? (
          <Pagination
            className="mt-4"
            page={page}
            pageCount={pageCount}
            onPageChange={(next) => setParam('page', String(next))}
          />
        ) : null}
      </>
    );
  };

  return (
    <>
      <PageHeader title="Competências" description="Abertura do mês e disparos de e-mail.">
        <Button onClick={() => setOpeningDialog(true)} className="shadow-xs font-medium">
          <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" /> Abrir competência
        </Button>
      </PageHeader>

      <div className="mt-8">
        {canPeriodZip ? null : (
          <PlanGateNotice capability="periodZip" className="mb-4">
            Baixar o zip da competência inteira (o zip por empresa continua liberado)
          </PlanGateNotice>
        )}
        {renderBody()}
      </div>

      <OpenPeriodDialog open={openingDialog} onOpenChange={setOpeningDialog} />

      <Modal
        open={closing !== null}
        onOpenChange={(open) => {
          if (!open) setClosing(null);
        }}
        title="Encerrar competência?"
        description="Encerrar é a palavra final: as solicitações desta competência também são encerradas, mesmo com pendências."
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={closePeriod.isPending}
              onClick={() => closing && confirmClose(closing)}
            >
              {closePeriod.isPending ? 'Encerrando…' : 'Encerrar competência'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          Os Responsáveis não poderão mais enviar documentos nos itens — apenas documentos extras.
        </p>
      </Modal>
    </>
  );
}

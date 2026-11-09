import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import type { MyDocument, MyPeriod } from '@/features/contact-area/api/contact-area.types';
import { PeriodDocuments } from '@/features/contact-area/components/period-documents';
import {
  useDownloadMyDocument,
  useMyPeriod,
  useOpenMyDocument,
} from '@/features/contact-area/queries/use-contact-area';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { StatusPill } from '@/shared/components/status-pill';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { cn } from '@/shared/lib/cn';
import { monthLabel } from '@/shared/lib/format';
import { displayItemStatus } from '@/shared/lib/item-status';

function PeriodDetail({ periodId, companyId }: { periodId: string; companyId: string }) {
  const period = useMyPeriod({ periodId, companyId });
  const openDocument = useOpenMyDocument();
  const downloadDocument = useDownloadMyDocument();

  const open = (document: MyDocument) =>
    openDocument
      .mutateAsync(document.id)
      .then(({ objectUrl }) => window.open(objectUrl, '_blank', 'noopener'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível abrir o documento.')),
      );

  const download = (document: MyDocument) =>
    downloadDocument
      .mutateAsync({ documentId: document.id, fileName: document.fileName })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível baixar o documento.')),
      );

  if (period.isPending) return <LoadingRows count={3} />;
  if (period.isError) {
    return (
      <ErrorState
        error={period.error}
        fallback="Confira sua conexão e tente de novo."
        retry={() => void period.refetch()}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {period.data.items.map((item) => (
        <section key={item.id}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold">{item.name}</h2>
            <StatusPill status={displayItemStatus(item)} />
          </div>
          {item.documents.length ? (
            <PeriodDocuments
              documents={item.documents}
              showReview
              onOpen={(document) => void open(document)}
              onDownload={(document) => void download(document)}
            />
          ) : (
            <p className="text-muted-foreground mt-1 text-xs">Nenhum arquivo enviado.</p>
          )}
        </section>
      ))}
      {period.data.extraDocuments.length ? (
        <section>
          <h2 className="text-foreground text-sm font-semibold">Documentos extras</h2>
          <PeriodDocuments
            documents={period.data.extraDocuments}
            showReview={false}
            onOpen={(document) => void open(document)}
            onDownload={(document) => void download(document)}
          />
        </section>
      ) : null}
    </div>
  );
}

type PeriodCardProps = { row: MyPeriod; expanded: boolean; onToggle: () => void };

export function PeriodCard({ row, expanded, onToggle }: PeriodCardProps) {
  const panelId = `period-${row.requestId}`;
  return (
    <li className="bg-card border-border rounded-xl border shadow-sm">
      <button
        type="button"
        className="hover:bg-muted/40 focus-visible:ring-ring flex w-full items-center justify-between gap-4 rounded-xl p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-semibold">
              {monthLabel(row.referenceMonth)}
            </span>
            <StatusPill status={row.requestStatus} />
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {row.companyName} · {row.itemCount - row.pendingCount} de {row.itemCount} itens
            aprovados · {row.deliveredCount}{' '}
            {row.deliveredCount === 1 ? 'arquivo enviado' : 'arquivos enviados'}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <div id={panelId} className="border-border border-t p-4">
          <PeriodDetail periodId={row.periodId} companyId={row.companyId} />
        </div>
      ) : null}
    </li>
  );
}

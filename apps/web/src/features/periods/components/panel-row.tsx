import {
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  FileArchive,
  Link as LinkIcon,
  Lock,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router';
import { ChannelFailures } from '@/features/periods/components/channel-failures';
import type { PanelLine } from '@/features/periods/components/panel-lines';
import { DueDate } from '@/shared/components/due-date';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { maskedCnpj } from '@/shared/lib/format';

type PanelRowProps = {
  line: PanelLine;
  expanded: boolean;
  copied: boolean;
  copying: boolean;
  resending: boolean;
  onToggle: () => void;
  onCopyLink: () => void;
  onDownloadZip: () => void;
  onClose: () => void;
  onResend: () => void;
};

const itemRow =
  'flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 gap-2 hover:bg-slate-50/75 transition-colors';
const sectionTitle =
  'text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 px-1';

export function PanelRowCard({
  line,
  expanded,
  copied,
  copying,
  resending,
  onToggle,
  onCopyLink,
  onDownloadZip,
  onClose,
  onResend,
}: PanelRowProps) {
  const closed = line.requestStatus === 'closed';

  return (
    <li className="bg-card border-border rounded-xl border shadow-xs overflow-hidden transition-all duration-150">
      <div className="flex flex-col gap-4 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="group flex items-center gap-2.5 text-left font-semibold text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md py-0.5"
              aria-expanded={expanded}
              onClick={onToggle}
            >
              <ChevronDown
                className={cn(
                  'text-muted-foreground group-hover:text-primary h-4 w-4 transition-transform duration-200',
                  !expanded && '-rotate-90',
                )}
                aria-hidden="true"
              />
              <span className="font-display text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                {line.companyName}
              </span>
            </button>
            {closed ? (
              <StatusPill status="closed" />
            ) : line.overdue > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-surface px-2.5 py-0.5 text-[11px] font-semibold text-danger-foreground">
                <TriangleAlert className="h-3 w-3 text-danger" aria-hidden="true" /> Atrasada
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground pl-6 text-xs tabular-nums">{maskedCnpj(line.cnpj)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
          <div className="text-muted-foreground flex flex-col sm:items-end text-xs sm:text-sm">
            <span className="font-medium text-foreground">
              <span className="tabular-nums font-semibold">{line.counts.accepted}</span> de{' '}
              <span className="tabular-nums font-semibold">{line.total}</span>
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {line.percent}% completo
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={line.counts.submitted > 0 ? 'default' : 'outline'}
              size="sm"
              className="shadow-xs font-medium"
              asChild
            >
              <Link to={`/solicitacoes/${line.requestId}`}>
                <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                {line.counts.submitted > 0 ? `Conferir (${line.counts.submitted})` : 'Envios'}
              </Link>
            </Button>
            {closed ? null : (
              <Button
                variant="outline"
                size="sm"
                className="shadow-xs"
                disabled={copying}
                onClick={onCopyLink}
              >
                {copied ? (
                  <Check className="mr-2 h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <LinkIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {copied ? 'Link copiado!' : copying ? 'Gerando...' : 'Copiar link'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="shadow-xs"
              aria-label={`Baixar .zip de ${line.companyName}`}
              onClick={onDownloadZip}
            >
              <FileArchive className="mr-2 h-4 w-4" aria-hidden="true" /> .zip
            </Button>
            {closed ? null : (
              <Button
                variant="outline"
                size="sm"
                className="text-danger hover:text-danger hover:bg-danger-surface border-border shadow-xs"
                aria-label={`Encerrar a solicitação de ${line.companyName}`}
                onClick={onClose}
              >
                <Lock className="mr-2 h-4 w-4" aria-hidden="true" /> Encerrar
              </Button>
            )}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="border-border bg-sunken/40 border-t p-4 sm:p-5">
          <ChannelFailures line={line} resending={resending} onResend={onResend} />
          {line.missing.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-success font-medium p-2">
              <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> Tudo conferido
            </div>
          ) : (
            <>
              {line.awaiting.length ? (
                <>
                  <h3 className={sectionTitle}>Aguardando Envio ({line.awaiting.length})</h3>
                  <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-xs overflow-hidden">
                    {line.awaiting.map((item) => (
                      <li key={item.id} className={itemRow}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          {item.status === 'rejected' ? (
                            <p className="text-danger mt-0.5 text-xs font-medium">
                              Recusado: aguardando reenvio
                            </p>
                          ) : null}
                        </div>
                        <DueDate date={item.dueDate} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {line.toReview.length ? (
                <>
                  <h3 className={cn(sectionTitle, line.awaiting.length > 0 && 'mt-4')}>
                    Enviado, a conferir ({line.toReview.length})
                  </h3>
                  <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-xs overflow-hidden">
                    {line.toReview.map((item) => (
                      <li key={item.id} className={itemRow}>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <span className="text-muted-foreground text-xs shrink-0">
                          {item.resent ? 'Reenviado após recusa' : 'Enviado'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

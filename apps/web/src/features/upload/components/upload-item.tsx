import { CheckCircle2, CircleCheck, File as FileIcon, Upload } from 'lucide-react';
import type { ChecklistItem } from '@/features/upload/api/upload.types';
import { Dropzone, UploadProgress } from '@/features/upload/components/dropzone';
import { ResendNotice } from '@/shared/components/resend-notice';
import { StatusPill } from '@/shared/components/status-pill';
import { cn } from '@/shared/lib/cn';
import { dateBr, isOverdue } from '@/shared/lib/format';
import { displayItemStatus, needsResend } from '@/shared/lib/item-status';

const pillStatusOf = (item: ChecklistItem) =>
  item.status === 'pending' && !needsResend(item) && isOverdue(item.dueDate)
    ? 'overdue'
    : displayItemStatus(item);

type UploadItemProps = {
  item: ChecklistItem;
  expanded: boolean;
  closed: boolean;
  sendingHere: boolean;
  sending: boolean;
  percent: number;
  onToggle: () => void;
  onFiles: (files: File[]) => void;
};

export function UploadItem({
  item,
  expanded,
  closed,
  sendingHere,
  sending,
  percent,
  onToggle,
  onFiles,
}: UploadItemProps) {
  const resend = needsResend(item);
  const waiting = item.status === 'pending' && !resend;
  const panelId = `upload-${item.id}`;

  const renderPanel = () => {
    if (item.status === 'accepted') {
      return (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CircleCheck className="text-success h-4 w-4" aria-hidden="true" />
          Este documento já foi conferido e aprovado pela contabilidade.
        </p>
      );
    }
    if (closed) {
      return (
        <p className="text-muted-foreground text-sm">
          Esta competência foi encerrada — envie pelo bloco de documento extra abaixo.
        </p>
      );
    }
    if (sendingHere) return <UploadProgress percent={percent} className="min-h-28" />;
    return (
      <Dropzone
        icon
        camera
        className="min-h-28"
        title="Arraste os arquivos aqui ou toque para escolher"
        hint="Pode enviar vários de uma vez, ou um .zip"
        disabled={sending}
        onFiles={onFiles}
      />
    );
  };

  return (
    <li
      className={cn(
        'flex flex-col transition-colors',
        waiting && 'bg-amber-50/40',
        resend && 'bg-rose-50/30',
      )}
    >
      <button
        type="button"
        className="hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset flex items-start justify-between gap-4 p-4 text-left focus-visible:outline-none transition-colors"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
            <StatusPill status={pillStatusOf(item)} />
          </span>
          <span className="text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
            <span
              className={cn(
                isOverdue(item.dueDate) &&
                  item.status !== 'accepted' &&
                  'font-semibold text-danger-foreground',
              )}
            >
              Prazo {dateBr(item.dueDate)}
            </span>
          </span>
        </span>
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            waiting && 'bg-amber-100 text-amber-800',
            resend && 'bg-rose-100 text-rose-800',
            item.status === 'accepted' && 'bg-emerald-100 text-emerald-800',
            item.status === 'submitted' && 'bg-sky-100 text-sky-800',
          )}
          aria-hidden="true"
        >
          {item.status === 'accepted' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </span>
      </button>

      {resend ? (
        <div className="mx-4 mb-4">
          <ResendNotice item={item} hint="Envie o documento corrigido no botão abaixo." />
        </div>
      ) : null}

      {item.documents.length ? (
        <ul className="border-border mx-4 mb-4 divide-y rounded-lg border bg-white">
          {item.documents.map((document, index) => (
            <li key={index} className="flex items-center gap-2 p-3 text-sm">
              <FileIcon className="text-muted-foreground shrink-0 h-4 w-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                Arquivo {index + 1}
              </span>
              <StatusPill status={document.reviewStatus} />
            </li>
          ))}
        </ul>
      ) : null}

      {expanded ? (
        <div id={panelId} className="border-border border-t p-4">
          {renderPanel()}
        </div>
      ) : null}
    </li>
  );
}

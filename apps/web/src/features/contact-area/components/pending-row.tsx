import { useRef } from 'react';
import { CircleAlert, Upload } from 'lucide-react';
import type { MyPendingItem } from '@/features/contact-area/api/contact-area.types';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { dateBr, isOverdue } from '@/shared/lib/format';
import { displayItemStatus, needsResend } from '@/shared/lib/item-status';

// O servidor aceita foto do documento além dos formatos do checklist.
const acceptOf = (formats: string[]) =>
  [...new Set([...formats.map((format) => `.${format}`), '.jpg', '.jpeg', '.png'])].join(',');

type PendingRowProps = {
  item: MyPendingItem['item'];
  sending: boolean;
  percent: number;
  onFiles: (files: File[]) => void;
};

export function PendingRow({ item, sending, percent, onFiles }: PendingRowProps) {
  const input = useRef<HTMLInputElement>(null);
  const resend = needsResend(item);
  const latestRejection = item.rejections.at(-1);

  return (
    <li
      className={cn(
        'flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between',
        resend ? 'bg-rose-50/30' : 'bg-amber-50/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground truncate text-sm font-semibold">{item.name}</span>
          <StatusPill status={displayItemStatus(item)} />
          {!resend && isOverdue(item.dueDate) ? (
            <span className="text-danger-foreground border-danger-border bg-danger-surface inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold">
              Atrasado
            </span>
          ) : null}
        </div>
        {item.description ? (
          <p className="text-muted-foreground mt-1 text-sm">{item.description}</p>
        ) : null}
        <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {item.dueDate ? <span>Prazo {dateBr(item.dueDate)}</span> : null}
          {item.acceptedFormats.length ? (
            <span>Formatos: {item.acceptedFormats.join(', ').toUpperCase()}</span>
          ) : null}
        </p>
        {latestRejection ? (
          <div className="bg-danger-surface border-danger-border text-danger-foreground mt-3 flex gap-2.5 rounded-lg border p-3 text-sm">
            <CircleAlert className="text-danger mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Motivo da recusa:</span>{' '}
              {latestRejection.rejectionReason}
            </span>
          </div>
        ) : null}
      </div>
      <div className="shrink-0">
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          multiple
          aria-label={`Arquivos para ${item.name}`}
          accept={acceptOf(item.acceptedFormats)}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length) onFiles(files);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          aria-live="polite"
          onClick={() => input.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          {sending ? `Enviando… ${percent}%` : 'Enviar arquivos'}
        </Button>
      </div>
    </li>
  );
}

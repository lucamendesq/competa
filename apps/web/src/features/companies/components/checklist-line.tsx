import type { ChecklistRow } from '@/features/companies/components/checklist-lines';
import { StatusPill } from '@/shared/components/status-pill';
import { cn } from '@/shared/lib/cn';
import { PERIODICITY_LABEL } from '@/shared/lib/format';

export function ChecklistLine({
  line,
  disabled,
  onToggle,
}: {
  line: ChecklistRow;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-wrap items-start gap-4 p-4 sm:p-5 hover:bg-slate-50/75 transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={line.included}
        className={cn(
          'focus-visible:ring-ring relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          line.included ? 'bg-primary' : 'bg-muted border-border border',
        )}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="sr-only">
          {line.included ? 'Remover' : 'Incluir'} {line.name}
        </span>
        <span
          className={cn(
            'bg-card size-4 rounded-full shadow transition-transform',
            line.included ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'text-sm font-medium',
              line.source === 'removido'
                ? 'line-through text-muted-foreground'
                : 'text-foreground font-display',
            )}
          >
            {line.name}
          </p>
          {line.source === 'removido' ? <StatusPill status="removed" /> : null}
          {line.source === 'adicionado' ? <StatusPill status="added" /> : null}
          {line.applicable ? null : (
            <StatusPill
              status="not_applicable"
              title={`Só entra se a característica ${line.conditionFlag} estiver ligada`}
            />
          )}
        </div>
        {line.description ? (
          <p className="text-muted-foreground mt-1 text-xs">{line.description}</p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex flex-wrap gap-1">
            {line.acceptedFormats.map((format) => (
              <span
                key={format}
                className="bg-muted text-muted-foreground border border-border/50 rounded-full px-2 py-0.5 font-medium text-[11px]"
              >
                {format}
              </span>
            ))}
          </span>
          <span className="text-muted-foreground font-medium">
            {PERIODICITY_LABEL[line.periodicity]}
          </span>
          {line.dueDay ? (
            <span className="text-muted-foreground tabular-nums">Vence no dia {line.dueDay}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

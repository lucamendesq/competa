import { COMPANY_FLAGS } from '@competa/contracts';
import { Trash2 } from 'lucide-react';
import type { DraftItem } from '@/features/checklists/components/template-draft';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { CATEGORY_LABEL, FLAG_LABEL, MONTH_OPTIONS } from '@/shared/lib/format';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50';

type TemplateItemRowProps = {
  item: DraftItem;
  dirty: boolean;
  readOnly: boolean;
  onChange: (change: Partial<DraftItem>) => void;
  onRemove: () => void;
};

export function TemplateItemRow({
  item,
  dirty,
  readOnly,
  onChange,
  onRemove,
}: TemplateItemRowProps) {
  const changeDay = (value: string) => {
    const dueDay = value === '' ? null : Number(value);
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) return;
    onChange({ dueDay });
  };

  return (
    <section className="bg-card border-border rounded-xl border p-5 shadow-sm transition-all">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-flex items-center rounded-full bg-sunken border border-border px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {CATEGORY_LABEL[item.category] ?? item.category}
            </span>
            {item.added ? (
              <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Novo
              </span>
            ) : null}
            {dirty && !item.added ? (
              <span className="inline-flex items-center rounded-full bg-warning-surface border border-warning-border px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
                Modificado
              </span>
            ) : null}
          </div>
          <h2 className="font-display text-base font-semibold text-foreground">{item.name}</h2>
          {item.description ? (
            <p className="text-muted-foreground mt-1.5 text-sm">{item.description}</p>
          ) : null}
          {item.acceptedFormats.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {item.acceptedFormats.map((format) => (
                <span
                  key={format}
                  className="inline-flex items-center rounded-full bg-muted/80 border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {format}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {readOnly ? null : (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-danger hover:bg-danger/10 h-8 w-8 rounded-lg transition-colors"
            aria-label={`Remover ${item.name}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="border-border mt-4 flex flex-wrap gap-4 border-t pt-4">
        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <label htmlFor={`periodicity-${item.id}`} className="text-xs font-medium text-foreground">
            Frequência
          </label>
          <select
            id={`periodicity-${item.id}`}
            className={SELECT_CLASS}
            disabled={readOnly}
            value={item.periodicity}
            onChange={(event) =>
              onChange({
                periodicity: event.target.value as DraftItem['periodicity'],
                annualMonth: event.target.value === 'annual' ? (item.annualMonth ?? 1) : null,
              })
            }
          >
            <option value="monthly">Mensal</option>
            <option value="annual">Anual</option>
            <option value="on_demand">Sob demanda</option>
          </select>
        </div>

        {item.periodicity === 'monthly' ? (
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <label htmlFor={`due-day-${item.id}`} className="text-xs font-medium text-foreground">
              Prazo (Dia)
            </label>
            <Input
              id={`due-day-${item.id}`}
              type="number"
              min={1}
              max={31}
              className="h-9 w-24 focus-visible:ring-ring focus-visible:border-primary"
              placeholder="Livre"
              disabled={readOnly}
              value={item.dueDay ?? ''}
              onChange={(event) => changeDay(event.target.value)}
            />
          </div>
        ) : null}

        {item.periodicity === 'annual' ? (
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <label
              htmlFor={`annual-month-${item.id}`}
              className="text-xs font-medium text-foreground"
            >
              Mês do envio
            </label>
            <select
              id={`annual-month-${item.id}`}
              className={`${SELECT_CLASS} w-32`}
              disabled={readOnly}
              value={item.annualMonth ?? 1}
              onChange={(event) => onChange({ annualMonth: Number(event.target.value) })}
            >
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={Number(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <label htmlFor={`condition-${item.id}`} className="text-xs font-medium text-foreground">
            Condição (Opcional)
          </label>
          <select
            id={`condition-${item.id}`}
            className={SELECT_CLASS}
            disabled={readOnly}
            value={item.conditionFlag ?? ''}
            onChange={(event) =>
              onChange({
                conditionFlag:
                  event.target.value === ''
                    ? null
                    : (event.target.value as DraftItem['conditionFlag']),
              })
            }
          >
            <option value="">Aplicar a todos</option>
            {COMPANY_FLAGS.map((flag) => (
              <option key={flag} value={flag}>
                Só se {(FLAG_LABEL[flag] ?? flag).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5 sm:mt-6 pt-1">
          <input
            type="checkbox"
            id={`req-${item.id}`}
            className="size-4 rounded border-border text-primary focus:ring-ring accent-primary"
            disabled={readOnly}
            checked={item.required}
            onChange={() => onChange({ required: !item.required })}
          />
          <label
            htmlFor={`req-${item.id}`}
            className="text-sm font-medium text-foreground cursor-pointer"
          >
            Obrigatório
          </label>
        </div>
      </div>
    </section>
  );
}

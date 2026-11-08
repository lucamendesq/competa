import { Search } from 'lucide-react';
import { STATUS_CHIPS, type PanelStatusFilter } from '@/features/periods/components/panel-lines';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/cn';

type PanelFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  accountant: string;
  accountantOptions: { value: string; label: string }[];
  onAccountantChange: (value: string) => void;
  status: PanelStatusFilter;
  counts: Record<PanelStatusFilter, number>;
  onStatusChange: (value: PanelStatusFilter) => void;
};

export function PanelFilters({
  search,
  onSearchChange,
  accountant,
  accountantOptions,
  onAccountantChange,
  status,
  counts,
  onStatusChange,
}: PanelFiltersProps) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          <div className="relative w-full sm:w-80">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-3 left-3 h-4 w-4"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Buscar empresa"
              placeholder="Buscar empresa"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="pl-9 w-full bg-card shadow-xs focus-visible:ring-ring focus-visible:border-primary"
            />
          </div>
          {accountantOptions.length > 0 ? (
            <select
              aria-label="Contador responsável"
              value={accountant}
              onChange={(event) => onAccountantChange(event.target.value)}
              className="flex h-10 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary text-foreground disabled:opacity-50"
            >
              {accountantOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div
        className="mb-5 flex gap-2 overflow-x-auto pb-2"
        role="group"
        aria-label="Filtrar empresas"
      >
        {STATUS_CHIPS.map((chip) => {
          const active = status === chip.value;
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
              onClick={() => onStatusChange(chip.value)}
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
    </>
  );
}

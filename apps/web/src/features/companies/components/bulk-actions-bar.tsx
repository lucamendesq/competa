import { useState } from 'react';
import { toast } from 'sonner';
import { useTemplateOptions } from '@/features/catalog';
import {
  useActivateCompanies,
  useApplyTemplate,
} from '@/features/companies/queries/use-company-mutations';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';

type BulkActionsBarProps = { selectedIds: ReadonlySet<string>; onClear: () => void };

export function BulkActionsBar({ selectedIds, onClear }: BulkActionsBarProps) {
  const [templateId, setTemplateId] = useState('');
  const templates = useTemplateOptions();
  const activate = useActivateCompanies();
  const applyTemplate = useApplyTemplate();
  const count = selectedIds.size;
  const busy = activate.isPending || applyTemplate.isPending;

  const activateSelected = () =>
    activate
      .mutateAsync([...selectedIds])
      .then((result) => {
        if (result.activated) toast.success(`${result.activated} empresa(s) ativada(s).`);
        if (result.reason) toast.warning(result.reason);
        if (!result.activated && !result.reason) toast.info('Nenhuma empresa inativa na seleção.');
        onClear();
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível ativar as empresas.')),
      );

  const applySelected = () =>
    applyTemplate
      .mutateAsync({ companyIds: [...selectedIds], checklistTemplateId: templateId })
      .then((result) => {
        toast.success(`Template aplicado a ${result.updated} empresa(s).`);
        onClear();
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível aplicar template.')),
      );

  return (
    <>
      <div className="h-20" aria-hidden="true" />
      <div
        className="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t p-3.5 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] lg:left-[260px]"
        role="region"
        aria-label="Ações em lote nas empresas selecionadas"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-sm text-foreground font-medium">
            <b className="font-semibold text-primary tabular-nums">{count}</b>{' '}
            {count === 1 ? 'empresa selecionada' : 'empresas selecionadas'}
          </p>
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="flex h-10 w-56 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Template de checklist"
          >
            <option value="">Escolha um template</option>
            {(templates.data ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            className="shadow-xs font-medium"
            disabled={busy}
            onClick={() => void activateSelected()}
          >
            {activate.isPending ? 'Ativando…' : 'Ativar selecionadas'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClear}>
            Limpar seleção
          </Button>
          <Button
            className="shadow-xs font-medium"
            disabled={applyTemplate.isPending || !templateId}
            onClick={() => void applySelected()}
          >
            {applyTemplate.isPending
              ? 'Aplicando…'
              : `Aplicar a ${count} ${count === 1 ? 'empresa' : 'empresas'}`}
          </Button>
        </div>
      </div>
    </>
  );
}

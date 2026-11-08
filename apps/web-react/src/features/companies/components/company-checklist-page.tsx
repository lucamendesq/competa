import { useState } from 'react';
import {
  CatalogPicker,
  filterCatalog,
  useDocumentTypes,
  type CatalogDocument,
} from '@/features/catalog';
import { Plus, RotateCcw } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChecklistLine } from '@/features/companies/components/checklist-line';
import {
  checklistRows,
  groupByCategory,
  type ChecklistRow,
} from '@/features/companies/components/checklist-lines';
import {
  useRemoveOverride,
  useSaveOverride,
} from '@/features/companies/queries/use-company-mutations';
import {
  useCompany,
  useEffectiveChecklist,
  useOverrides,
} from '@/features/companies/queries/use-company-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { Modal } from '@/shared/components/modal';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { CATEGORY_LABEL } from '@/shared/lib/format';

const NEW_OVERRIDE = { periodicity: 'monthly', dueMonthOffset: 1, required: true } as const;

export function CompanyChecklistPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const created = ['1', 'true'].includes(searchParams.get('created') ?? '');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);

  const company = useCompany(id);
  const effective = useEffectiveChecklist(id);
  const overrides = useOverrides(id);
  const documentTypes = useDocumentTypes({ page: 1, perPage: 100 });
  const saveOverride = useSaveOverride(id);
  const removeOverride = useRemoveOverride(id);
  const acting = saveOverride.isPending || removeOverride.isPending;

  const rows = checklistRows(effective.data, overrides.data);
  const customized = (overrides.data ?? []).length > 0;
  const template = effective.data?.template ?? null;
  const available = filterCatalog(
    documentTypes.data?.data ?? [],
    new Set(rows.map((row) => row.documentTypeId)),
    catalogSearch,
  );

  const toggle = (line: ChecklistRow) => {
    const change =
      line.source === 'template'
        ? saveOverride
            .mutateAsync({ documentTypeId: line.documentTypeId, action: 'remove', ...NEW_OVERRIDE })
            .then(() => `${line.name} saiu do checklist desta empresa.`)
        : removeOverride
            .mutateAsync(line.documentTypeId)
            .then(() =>
              line.source === 'removido'
                ? `${line.name} voltou para o checklist.`
                : `${line.name} foi removido do checklist.`,
            );
    return change
      .then((message) => toast.success(message))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível alterar o checklist.')),
      );
  };

  const add = (document: CatalogDocument) =>
    saveOverride
      .mutateAsync({ documentTypeId: document.id, action: 'add', ...NEW_OVERRIDE })
      .then(() => toast.success(`${document.name} adicionado ao checklist.`))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível adicionar o documento.')),
      );

  const restoreDefault = () =>
    Promise.all(
      (overrides.data ?? []).map((override) => removeOverride.mutateAsync(override.documentTypeId)),
    )
      .then(() => toast.success('Checklist restaurado para o padrão do template.'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível restaurar o padrão.')),
      )
      .finally(() => setConfirmRestore(false));

  const renderBody = () => {
    if (effective.isPending) return <LoadingRows count={8} />;
    if (effective.isError) {
      return (
        <ErrorState
          error={effective.error}
          fallback="Não conseguimos carregar o checklist."
          retry={() => void effective.refetch()}
        />
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {groupByCategory(rows).map(([category, lines]) => (
          <section
            key={category}
            className="bg-card border-border rounded-xl border shadow-sm overflow-hidden"
          >
            <div className="bg-sunken/60 border-b border-border px-5 py-3.5 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                <span>{CATEGORY_LABEL[category] ?? category}</span>
                <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                  {lines.length}
                </span>
              </h2>
            </div>
            <ul className="divide-border divide-y">
              {lines.map((line) => (
                <ChecklistLine
                  key={line.documentTypeId}
                  line={line}
                  disabled={acting}
                  onToggle={() => void toggle(line)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={`Checklist de ${company.data?.name ?? ''}`}
        description={
          template
            ? `Baseado no template ${template.name}`
            : 'Documentos avulsos desta empresa (sem template).'
        }
      >
        {customized && template ? (
          <Button variant="ghost" className="shadow-xs" onClick={() => setConfirmRestore(true)}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Restaurar padrão do template
          </Button>
        ) : null}
        <Button className="shadow-xs font-medium" onClick={() => setCatalogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar documento
        </Button>
        <Button variant="outline" asChild className="shadow-xs">
          <Link to={`/empresas/${id}/editar`}>Voltar para a empresa</Link>
        </Button>
      </PageHeader>

      {created ? (
        <section
          className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-info-border bg-info-surface/80 p-4 sm:p-5 shadow-xs"
          role="status"
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-info-foreground">
              Empresa cadastrada. Falta um ajuste?
            </h2>
            <p className="mt-0.5 text-xs text-info-foreground/90">
              Este é o checklist que vai ser cobrado todo mês. Remova o que esta empresa não tem e
              adicione o que faltar — sem precisar criar um template novo.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="shadow-xs bg-card">
            <Link to="/empresas">Está bom assim</Link>
          </Button>
        </section>
      ) : null}

      <div className="mt-8">{renderBody()}</div>

      <Modal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        title="Adicionar documento do catálogo"
        description="Documentos fora do template base desta empresa."
        footer={
          <Button variant="ghost" onClick={() => setCatalogOpen(false)}>
            Fechar
          </Button>
        }
      >
        <CatalogPicker
          documents={available}
          search={catalogSearch}
          onSearchChange={setCatalogSearch}
          acting={acting}
          emptyLabel="Nenhum documento do catálogo fora deste checklist."
          onAdd={(document) => void add(document)}
        />
      </Modal>

      <Modal
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title="Restaurar padrão do template?"
        description="Todos os ajustes desta empresa serão descartados."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRestore(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={acting} onClick={() => void restoreDefault()}>
              Restaurar padrão
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          O checklist volta a ser exatamente o do template <strong>{template?.name}</strong>.
          Competências já abertas não mudam.
        </p>
      </Modal>
    </>
  );
}

import { useReducer, useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CatalogPicker, filterCatalog, useDocumentTypes } from '@/features/catalog';
import type { TemplateDetail } from '@/features/checklists/api/template.types';
import { LeaveGuard } from '@/features/checklists/components/leave-guard';
import {
  draftOf,
  draftReducer,
  isItemDirty,
  pendingCountOf,
  schedulingOf,
  visibleItemsOf,
  type DraftItem,
} from '@/features/checklists/components/template-draft';
import { TemplateItemRow } from '@/features/checklists/components/template-item-row';
import {
  useAddTemplateItem,
  useDeleteTemplate,
  useDeriveTemplate,
  useRemoveTemplateItem,
  useRenameTemplate,
  useUpdateTemplateItem,
} from '@/features/checklists/queries/use-template-mutations';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { TemplateEditorHeader } from '@/features/checklists/components/template-editor-header';

type TemplateEditorProps = {
  template: TemplateDetail;
  refetch: () => Promise<TemplateDetail | undefined>;
};

export function TemplateEditor({ template, refetch }: TemplateEditorProps) {
  const navigate = useNavigate();
  const [draft, dispatch] = useReducer(draftReducer, template, draftOf);
  const [saving, setSaving] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState<DraftItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const documentTypes = useDocumentTypes({ page: 1, perPage: 100 });
  const rename = useRenameTemplate(template.id);
  const addItem = useAddTemplateItem(template.id);
  const updateItem = useUpdateTemplateItem(template.id);
  const removeItem = useRemoveTemplateItem(template.id);
  const derive = useDeriveTemplate();
  const deleteTemplate = useDeleteTemplate();

  const readOnly = template.accountingFirmId === null;
  const visible = visibleItemsOf(draft);
  const hasChanges = pendingCountOf(draft, template) > 0;
  const acting = saving || derive.isPending || deleteTemplate.isPending;
  const available = filterCatalog(
    documentTypes.data?.data ?? [],
    new Set(visible.map((item) => item.documentTypeId)),
    catalogSearch,
  );

  const resetFromServer = () =>
    refetch().then((fresh) => {
      if (fresh) dispatch({ type: 'reset', template: fresh });
    });

  const save = async () => {
    if (!hasChanges) return;
    const name = draft.name.trim();
    if (!name) {
      dispatch({ type: 'nameError', message: 'Informe o nome do template.' });
      toast.error('Informe o nome do template.');
      return;
    }
    setSaving(true);
    const changed = visible.filter((item) => item.added || isItemDirty(item, template));
    try {
      if (name !== template.name) await rename.mutateAsync(name);
      for (const itemId of draft.removedIds) await removeItem.mutateAsync(itemId);
      for (const item of changed) {
        if (item.added) {
          await addItem.mutateAsync({ documentTypeId: item.documentTypeId, ...schedulingOf(item) });
        } else {
          await updateItem.mutateAsync({ itemId: item.id, body: schedulingOf(item) });
        }
      }
      toast.success('Template salvo.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Não foi possível salvar o template.'));
    } finally {
      await resetFromServer();
      setSaving(false);
    }
  };

  const deriveAndEdit = () =>
    derive
      .mutateAsync({ id: template.id, name: `${draft.name} (Cópia)` })
      .then((copy) => navigate(`/templates/${copy.id}`))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível duplicar o template.')),
      );

  const remove = () =>
    deleteTemplate
      .mutateAsync(template.id)
      .then(() => {
        toast.success('Template excluído.');
        setConfirmDelete(false);
        return navigate('/templates');
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível excluir o template.')),
      );

  return (
    <>
      <TemplateEditorHeader readOnly={readOnly}>
        {readOnly ? (
          <Button
            disabled={acting}
            className="shadow-xs font-medium"
            onClick={() => void deriveAndEdit()}
          >
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Duplicar para editar
          </Button>
        ) : (
          <Button className="shadow-xs font-medium" onClick={() => setCatalogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar documento
          </Button>
        )}
      </TemplateEditorHeader>

      <div className="mt-8">
        <div className="bg-card border-border rounded-xl border p-5 shadow-sm mb-6 flex flex-col gap-2 max-w-xl">
          <label
            htmlFor="templateName"
            className="text-sm font-semibold font-display text-foreground"
          >
            Nome do template
          </label>
          <Input
            id="templateName"
            value={draft.name}
            className="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
            disabled={readOnly}
            aria-invalid={draft.nameError ? true : undefined}
            aria-describedby={draft.nameError ? 'templateNameError' : undefined}
            onChange={(event) => dispatch({ type: 'rename', name: event.target.value })}
          />
          {draft.nameError ? (
            <p id="templateNameError" className="text-danger text-sm">
              {draft.nameError}
            </p>
          ) : null}
          {readOnly ? (
            <p className="text-muted-foreground text-xs">
              Templates padrão são somente leitura. Duplique para ajustar ao seu uso.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 pb-24">
          {visible.map((item) => (
            <TemplateItemRow
              key={item.id}
              item={item}
              dirty={isItemDirty(item, template)}
              readOnly={readOnly}
              onChange={(change) => dispatch({ type: 'patch', itemId: item.id, change })}
              onRemove={() => setConfirmRemoval(item)}
            />
          ))}
          {visible.length === 0 ? (
            <div className="border-border rounded-xl border-2 border-dashed p-12 text-center bg-card">
              <p className="text-muted-foreground text-sm">Este template não possui documentos.</p>
            </div>
          ) : null}
          {readOnly ? null : (
            <div className="mt-8 flex justify-end">
              <Button
                variant="ghost"
                className="text-danger hover:text-danger hover:bg-danger/10"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir template inteiro
              </Button>
            </div>
          )}
        </div>
      </div>

      {hasChanges ? (
        <div className="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t p-3.5 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] lg:left-[260px]">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-warning-foreground bg-warning-surface border border-warning-border rounded-full px-3 py-1 shadow-xs">
              Alterações não salvas
            </span>
            <div className="flex items-center gap-2.5">
              <Button
                variant="ghost"
                disabled={acting}
                onClick={() => dispatch({ type: 'reset', template })}
              >
                Descartar
              </Button>
              <Button
                disabled={acting}
                className="shadow-xs font-medium"
                onClick={() => void save()}
              >
                {saving ? 'Salvando...' : 'Salvar template'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        title="Adicionar documento do catálogo"
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
          emptyLabel="Todos os documentos aplicáveis já estão no template."
          onAdd={(document) => {
            dispatch({ type: 'add', document });
            setCatalogOpen(false);
            toast.success(`${document.name} entra no template quando você salvar.`);
          }}
        />
      </Modal>

      <Modal
        open={confirmRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoval(null);
        }}
        title="Remover documento?"
        description="O documento deixará de ser exigido de todas as empresas que usam este template."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemoval(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmRemoval) dispatch({ type: 'remove', item: confirmRemoval });
                setConfirmRemoval(null);
              }}
            >
              Remover
            </Button>
          </>
        }
      />

      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir template?"
        description="Só dá para excluir um template que nenhuma empresa usa. As solicitações já abertas não mudam."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={acting} onClick={() => void remove()}>
              Excluir
            </Button>
          </>
        }
      />

      <LeaveGuard when={hasChanges && !deleteTemplate.isSuccess} />
    </>
  );
}

import { useState } from 'react';
import { Plus, SquareCheckBig } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useTemplateOptions, type TemplateOption } from '@/features/catalog';
import { TemplateNameDialog } from '@/features/checklists/components/template-name-dialog';
import {
  useCreateTemplate,
  useDeriveTemplate,
} from '@/features/checklists/queries/use-template-mutations';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { apiErrorMessage } from '@/shared/lib/api-error';

const ROW_ACTION_CLASS = 'h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground';

export function ChecklistsListPage() {
  const navigate = useNavigate();
  const templates = useTemplateOptions();
  const createTemplate = useCreateTemplate();
  const deriveTemplate = useDeriveTemplate();
  const [blankOpen, setBlankOpen] = useState(false);
  const [deriving, setDeriving] = useState<TemplateOption | null>(null);

  const createBlank = (name: string) =>
    createTemplate
      .mutateAsync(name)
      .then((created) => {
        toast.success('Template criado com sucesso.');
        return navigate(`/templates/${created.id}`);
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível criar o template.')),
      )
      .finally(() => setBlankOpen(false));

  const derive = (source: TemplateOption, name: string) =>
    deriveTemplate
      .mutateAsync({ id: source.id, name })
      .then((copy) => {
        toast.success('Template copiado com sucesso.');
        return navigate(`/templates/${copy.id}`);
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível duplicar o template.')),
      )
      .finally(() => setDeriving(null));

  const renderBody = () => {
    if (templates.isPending) return <LoadingRows />;
    if (templates.isError) {
      return (
        <ErrorState
          error={templates.error}
          fallback="Não foi possível carregar."
          retry={() => void templates.refetch()}
        />
      );
    }
    if (templates.data.length === 0) {
      return (
        <EmptyState
          icon={SquareCheckBig}
          title="Nenhum checklist encontrado"
          description="Crie um checklist do zero e escolha quais documentos cada empresa precisa enviar."
          actionLabel="Criar checklist"
          onAction={() => setBlankOpen(true)}
        />
      );
    }
    return (
      <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-sunken/60">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="font-semibold text-foreground">Nome</TableHead>
                <TableHead className="font-semibold text-foreground">Itens</TableHead>
                <TableHead className="font-semibold text-foreground">Empresas usando</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.data.map((template) => (
                <TableRow
                  key={template.id}
                  className="border-border hover:bg-slate-50/75 transition-colors"
                >
                  <TableCell className="font-medium font-display text-foreground">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/templates/${template.id}`}
                        className="hover:text-primary transition-colors hover:underline"
                      >
                        {template.name}
                      </Link>
                      {template.isProduct ? (
                        <span className="bg-primary/10 text-primary border border-primary/20 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold">
                          Padrão Competa
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <span className="tabular-nums font-medium text-foreground">
                      {template.itemCount}
                    </span>{' '}
                    documentos
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <span className="tabular-nums font-medium text-foreground">
                      {template.companyCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="sm" asChild className={ROW_ACTION_CLASS}>
                        <Link to={`/templates/${template.id}`}>
                          {template.isProduct ? 'Ver' : 'Editar'}
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={ROW_ACTION_CLASS}
                        onClick={() => setDeriving(template)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Duplicar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Templates de Checklist"
        description="Modelos de solicitação reutilizáveis por segmento ou regime."
      >
        <Button className="shadow-xs font-medium" onClick={() => setBlankOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Criar checklist
        </Button>
      </PageHeader>

      <div className="mt-8">{renderBody()}</div>

      {deriving ? (
        <TemplateNameDialog
          title="Duplicar template"
          description={`Criar um novo template baseado em ${deriving.name}`}
          label="Nome do novo template"
          inputId="deriveName"
          initialName={`${deriving.name} (Cópia)`}
          submitLabel="Criar cópia"
          pendingLabel="Duplicando..."
          pending={deriveTemplate.isPending}
          onSubmit={(name) => void derive(deriving, name)}
          onClose={() => setDeriving(null)}
        />
      ) : null}
      {blankOpen ? (
        <TemplateNameDialog
          title="Criar template em branco"
          description="Crie um novo template de documentos do zero."
          label="Nome do template"
          inputId="blankName"
          initialName=""
          submitLabel="Criar template"
          pendingLabel="Criando..."
          pending={createTemplate.isPending}
          onSubmit={(name) => void createBlank(name)}
          onClose={() => setBlankOpen(false)}
        />
      ) : null}
    </>
  );
}

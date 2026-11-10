import { useParams } from 'react-router';
import { TemplateEditor } from '@/features/checklists/components/template-editor';
import { TemplateEditorHeader } from '@/features/checklists/components/template-editor-header';
import { useTemplate } from '@/features/checklists/queries/use-template-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { NotFoundState } from '@/shared/components/not-found-state';
import { isNotFound } from '@/shared/lib/api-error';

export function TemplateEditorPage() {
  const { id = '' } = useParams();
  const template = useTemplate(id);

  if (template.isPending || template.isError) {
    return (
      <>
        <TemplateEditorHeader />
        <div className="mt-8">
          {template.isPending ? (
            <LoadingRows />
          ) : isNotFound(template.error) ? (
            <NotFoundState
              title="Template não encontrado"
              to="/templates"
              backLabel="Ver templates"
            />
          ) : (
            <ErrorState
              error={template.error}
              fallback="Não foi possível carregar."
              retry={() => void template.refetch()}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <TemplateEditor
      key={id}
      template={template.data}
      refetch={() => template.refetch().then((result) => result.data)}
    />
  );
}

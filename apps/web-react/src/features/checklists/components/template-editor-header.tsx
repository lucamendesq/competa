import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/components/ui/button';

export function TemplateEditorHeader({
  readOnly,
  children,
}: {
  readOnly?: boolean;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <PageHeader
      title="Editar Checklist"
      description={
        readOnly
          ? 'Este é um template padrão, somente leitura. Duplique para ajustar ao seu uso.'
          : 'Ajuste os documentos exigidos para empresas com este template.'
      }
    >
      <Button variant="outline" className="mr-2 shadow-xs" onClick={() => void navigate(-1)}>
        Voltar
      </Button>
      {children}
    </PageHeader>
  );
}

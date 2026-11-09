import { useParams } from 'react-router';
import { CompanyForm } from '@/features/companies/components/company-form';
import { useCompany } from '@/features/companies/queries/use-company-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { NotFoundState } from '@/shared/components/not-found-state';
import { PageHeader } from '@/shared/components/page-header';
import { isNotFound } from '@/shared/lib/api-error';

function EditCompany({ id }: { id: string }) {
  const company = useCompany(id);

  if (company.isPending) return <LoadingRows count={6} />;
  if (isNotFound(company.error)) {
    return <NotFoundState title="Empresa não encontrada" to="/empresas" backLabel="Ver empresas" />;
  }
  if (company.isError) {
    return (
      <ErrorState
        error={company.error}
        fallback="Não conseguimos carregar a empresa."
        retry={() => void company.refetch()}
      />
    );
  }
  return <CompanyForm key={id} company={company.data} />;
}

export function CompanyFormPage() {
  const { id } = useParams();

  return (
    <>
      <PageHeader title={id ? 'Editar empresa' : 'Nova empresa'} />
      {id ? <EditCompany id={id} /> : <CompanyForm company={null} />}
    </>
  );
}

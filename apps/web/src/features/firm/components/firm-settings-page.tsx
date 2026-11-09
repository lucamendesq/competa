import { FirmForm } from '@/features/firm/components/firm-form';
import { useFirm } from '@/features/firm/queries/use-firm';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { PageHeader } from '@/shared/components/page-header';

export function FirmSettingsPage() {
  const firm = useFirm();

  const renderBody = () => {
    if (firm.isPending) return <LoadingRows count={5} />;
    if (firm.isError) {
      return (
        <ErrorState
          error={firm.error}
          fallback="Não foi possível carregar."
          retry={() => void firm.refetch()}
        />
      );
    }
    return <FirmForm key={firm.data.id} firm={firm.data} />;
  };

  return (
    <>
      <PageHeader
        title="Contabilidade"
        description="Dados do escritório e cadência das cobranças automáticas."
      />
      <div className="mt-8 max-w-2xl">{renderBody()}</div>
    </>
  );
}

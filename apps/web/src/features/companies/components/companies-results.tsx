import { useState } from 'react';
import { toast } from 'sonner';
import type { Company } from '@/features/companies/api/company.types';
import { BulkActionsBar } from '@/features/companies/components/bulk-actions-bar';
import { CompaniesTable } from '@/features/companies/components/companies-table';
import {
  useDeactivateCompany,
  useReactivateCompany,
} from '@/features/companies/queries/use-company-mutations';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import { Pagination } from '@/shared/components/ui/pagination';
import { apiErrorMessage } from '@/shared/lib/api-error';

type CompaniesResultsProps = {
  companies: Company[];
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function CompaniesResults({
  companies,
  page,
  pageCount,
  onPageChange,
}: CompaniesResultsProps) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [confirmDeactivate, setConfirmDeactivate] = useState<Company | null>(null);
  const deactivate = useDeactivateCompany();
  const reactivate = useReactivateCompany();

  const toggle = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((current) =>
      current.size === companies.length ? new Set() : new Set(companies.map((row) => row.id)),
    );

  const confirm = (company: Company) =>
    deactivate
      .mutateAsync(company.id)
      .then(() => {
        toast.success('Empresa desativada.');
        setConfirmDeactivate(null);
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível desativar.')),
      );

  const onReactivate = (company: Company) =>
    reactivate
      .mutateAsync(company.id)
      .then(() => toast.success('Empresa reativada.'))
      .catch((error: unknown) => toast.error(apiErrorMessage(error, 'Não foi possível reativar.')));

  return (
    <>
      <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <CompaniesTable
          companies={companies}
          selectedIds={selectedIds}
          reactivating={reactivate.isPending}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onDeactivate={setConfirmDeactivate}
          onReactivate={(company) => void onReactivate(company)}
        />
        {pageCount > 1 ? (
          <Pagination
            className="mt-4"
            page={page}
            pageCount={pageCount}
            onPageChange={onPageChange}
          />
        ) : null}
      </div>

      <Modal
        open={confirmDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivate(null);
        }}
        title="Desativar empresa?"
        description="Empresa desativada não recebe solicitação nas próximas competências."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeactivate(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deactivate.isPending}
              onClick={() => confirmDeactivate && void confirm(confirmDeactivate)}
            >
              Desativar
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          {confirmDeactivate?.name} deixa de ser cobrada. Nas solicitações já abertas, o Link de
          Upload para de abrir e os lembretes param. Ao reativar a empresa, o link volta a
          funcionar.
        </p>
      </Modal>

      {selectedIds.size ? (
        <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />
      ) : null}
    </>
  );
}

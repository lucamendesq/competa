import { Mail } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { Message } from '@/features/messages/api/message.types';
import { MessagesFilters } from '@/features/messages/components/messages-filters';
import { MessagesTable } from '@/features/messages/components/messages-table';
import {
  messageQueryOf,
  PER_PAGE,
  withFilter,
  type FilterField,
} from '@/features/messages/components/message-query';
import { useCompanyFilterOptions, useMessages } from '@/features/messages/queries/use-messages';
import { useResendMessage } from '@/features/messages/queries/use-resend-message';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { PageHeader } from '@/shared/components/page-header';
import { EmptyState } from '@/shared/components/ui/empty';
import { Pagination } from '@/shared/components/ui/pagination';
import { apiErrorMessage } from '@/shared/lib/api-error';

export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = messageQueryOf(searchParams);
  const messages = useMessages(query);
  const companies = useCompanyFilterOptions();
  const resend = useResendMessage();
  const filtered = Boolean(query.companyId || query.channel || query.purpose || query.status);

  const changeFilter = (field: FilterField, value: string) =>
    setSearchParams((current) => withFilter(current, field, value));

  const changePage = (page: number) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(page));
      return next;
    });

  const onResend = (row: Message) =>
    resend
      .mutateAsync(row.id)
      .then(({ sent }) => {
        if (sent) toast.success(`Mensagem reenviada para ${row.recipient}.`);
        else
          toast.error(
            `Não foi possível entregar a mensagem para ${row.recipient}. Confira o cadastro da empresa.`,
          );
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível reenviar a mensagem.')),
      );

  const renderBody = () => {
    if (messages.isError) {
      return (
        <ErrorState
          error={messages.error}
          fallback="Não foi possível carregar."
          retry={() => void messages.refetch()}
        />
      );
    }
    if (messages.isPending) return <LoadingRows />;
    if (messages.data.data.length === 0) {
      return (
        <EmptyState
          icon={Mail}
          title="Nenhuma mensagem"
          description={
            filtered
              ? 'Nenhuma mensagem corresponde ao filtro atual.'
              : 'As mensagens aparecem aqui quando uma competência é aberta.'
          }
        />
      );
    }
    const pageCount = Math.ceil(messages.data.meta.total / PER_PAGE);
    return (
      <>
        <MessagesTable
          messages={messages.data.data}
          resendingId={resend.isPending ? (resend.variables ?? null) : null}
          onResend={(row) => void onResend(row)}
        />
        {pageCount > 1 ? (
          <Pagination
            className="mt-4"
            page={query.page}
            pageCount={pageCount}
            onPageChange={changePage}
          />
        ) : null}
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="Mensagens"
        description="Log de entrega dos e-mails, WhatsApp e push enviados aos Responsáveis."
      />
      <section className="mt-8">
        <MessagesFilters query={query} companies={companies.data ?? []} onChange={changeFilter} />
        {renderBody()}
      </section>
    </>
  );
}

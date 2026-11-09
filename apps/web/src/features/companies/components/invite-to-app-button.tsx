import { Check, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { Company } from '@/features/companies/api/company.types';
import { useSendAccessInvites } from '@/features/companies/queries/use-company-mutations';
import { useIsInvited, useMarkInvited } from '@/features/companies/store/invited-companies.store';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';

export function InviteToAppButton({ company }: { company: Company }) {
  const invited = useIsInvited(company.id);
  const markInvited = useMarkInvited();
  const sendInvites = useSendAccessInvites();

  const invite = () =>
    sendInvites
      .mutateAsync([company.id])
      .then((result) => {
        if (result.invited > 0) {
          markInvited([company.id]);
          toast.success(
            result.invited === 1
              ? 'Convite enviado por e-mail.'
              : `${result.invited} convites enviados.`,
          );
        }
        const reasons = [
          ...new Set(
            result.results
              .filter((row) => row.status !== 'invited')
              .map((row) => (row.email ? `${row.email}: ${row.reason}` : row.reason))
              .filter(Boolean),
          ),
        ];
        if (reasons.length) toast.info(reasons.join(' '));
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível enviar o convite.')),
      );

  const label = invited
    ? 'Convite enviado'
    : sendInvites.isPending
      ? 'Convidando…'
      : 'Convidar para o app';

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
      disabled={sendInvites.isPending || invited}
      onClick={() => void invite()}
    >
      {invited ? (
        <Check className="mr-1.5 h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}

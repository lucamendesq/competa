import { toast } from 'sonner';
import type { Contact } from '@/features/companies/api/company.types';
import { useRevokeAccess } from '@/features/companies/queries/use-company-mutations';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';

type RevokeAccessDialogProps = {
  companyId: string;
  contact: Contact | null;
  onOpenChange: (open: boolean) => void;
};

export function RevokeAccessDialog({ companyId, contact, onOpenChange }: RevokeAccessDialogProps) {
  const revokeAccess = useRevokeAccess(companyId);

  const confirm = (target: Contact) =>
    revokeAccess
      .mutateAsync(target.id)
      .then(() => toast.success(`Acesso de ${target.name} revogado.`))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível revogar o acesso.')),
      )
      .finally(() => onOpenChange(false));

  return (
    <Modal
      open={contact !== null}
      onOpenChange={onOpenChange}
      title="Revogar acesso?"
      description="O Responsável deixa de entrar na Minha Área desta empresa."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={revokeAccess.isPending}
            onClick={() => contact && void confirm(contact)}
          >
            Revogar acesso
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">
        {contact?.name} perde a conta e o link de envio atual deixa de funcionar. Se a empresa ainda
        precisar enviar documentos, reenvie o link pela Solicitação.
      </p>
    </Modal>
  );
}

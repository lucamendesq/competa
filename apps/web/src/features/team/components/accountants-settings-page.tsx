import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { PendingInvite, TeamAccountant } from '@/features/team/api/team.types';
import { AccountantsTable } from '@/features/team/components/accountants-table';
import { ConfirmDialog } from '@/features/team/components/confirm-dialog';
import { InviteForm } from '@/features/team/components/invite-form';
import { InvitesList } from '@/features/team/components/invites-list';
import { useRemoveAccountant, useRevokeInvite } from '@/features/team/queries/use-team-mutations';
import { useAccountants, usePendingInvites } from '@/features/team/queries/use-team-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { Modal } from '@/shared/components/modal';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { useSession } from '@/shared/session';

export function AccountantsSettingsPage() {
  const { isOwner } = useSession();
  const accountants = useAccountants();
  const invites = usePendingInvites();
  const removeAccountant = useRemoveAccountant();
  const revokeInvite = useRevokeInvite();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFormKey, setInviteFormKey] = useState(0);
  const [confirmRemoval, setConfirmRemoval] = useState<TeamAccountant | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PendingInvite | null>(null);

  const openInvite = () => {
    setInviteFormKey((key) => key + 1);
    setInviteOpen(true);
  };

  const remove = (target: TeamAccountant) =>
    removeAccountant
      .mutateAsync(target.id)
      .then(() => toast.success(`${target.name} removido da equipe.`))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível remover o contador.')),
      )
      .finally(() => setConfirmRemoval(null));

  const revoke = (target: PendingInvite) =>
    revokeInvite
      .mutateAsync(target.id)
      .then(() => toast.success('Convite revogado.'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível revogar o convite.')),
      )
      .finally(() => setConfirmRevoke(null));

  const renderAccountants = () => {
    if (accountants.isPending) return <LoadingRows />;
    if (accountants.isError) {
      return (
        <ErrorState
          error={accountants.error}
          fallback="Não foi possível carregar a equipe."
          retry={() => void accountants.refetch()}
        />
      );
    }
    return (
      <AccountantsTable
        accountants={accountants.data}
        isOwner={isOwner}
        onRemove={setConfirmRemoval}
      />
    );
  };

  const renderInvites = () => {
    if (invites.isPending) return <LoadingRows count={2} />;
    if (invites.isError) {
      return (
        <ErrorState
          error={invites.error}
          fallback="Não foi possível carregar os convites."
          retry={() => void invites.refetch()}
        />
      );
    }
    return <InvitesList invites={invites.data} isOwner={isOwner} onRevoke={setConfirmRevoke} />;
  };

  return (
    <>
      <PageHeader title="Equipe" description="Contadores com acesso a esta Contabilidade.">
        {isOwner ? (
          <Button onClick={openInvite}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" /> Convidar contador
          </Button>
        ) : null}
      </PageHeader>

      <div className="mt-8 flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-base font-semibold font-display text-foreground">Contadores</h2>
          {renderAccountants()}
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold font-display text-foreground">
            Convites pendentes
          </h2>
          {renderInvites()}
        </section>
        {isOwner ? null : (
          <p className="text-muted-foreground text-xs">
            Apenas o dono da Contabilidade pode convidar ou remover contadores.
          </p>
        )}
      </div>

      <Modal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Convidar contador"
        description="O convidado recebe um e-mail com o link para criar a conta."
      >
        <InviteForm key={inviteFormKey} onClose={() => setInviteOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={confirmRemoval !== null}
        title="Remover contador?"
        description="A sessão e as passkeys dele são revogadas imediatamente."
        confirmLabel="Remover"
        pending={removeAccountant.isPending}
        onConfirm={() => confirmRemoval && void remove(confirmRemoval)}
        onCancel={() => setConfirmRemoval(null)}
      />
      <ConfirmDialog
        open={confirmRevoke !== null}
        title="Revogar convite?"
        description="O link enviado deixa de funcionar."
        confirmLabel="Revogar"
        pending={revokeInvite.isPending}
        onConfirm={() => confirmRevoke && void revoke(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />
    </>
  );
}

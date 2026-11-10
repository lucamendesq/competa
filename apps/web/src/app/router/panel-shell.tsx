import { Outlet, useNavigate } from 'react-router';
import { useSignOut } from '@/features/auth';
import { PanelLayout } from '@/shared/components/layout/panel-layout';
import { useWritesInFlight } from '@/shared/lib/query-client';
import { useSession } from '@/shared/session';

export function PanelShell() {
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const busy = useWritesInFlight();

  const accountant = session.accountant;

  return (
    <PanelLayout
      firmName={accountant?.accountingFirm.name ?? ''}
      accountantName={accountant?.accountant.name ?? ''}
      accountantEmail={accountant?.accountant.email ?? ''}
      isOwner={session.isOwner}
      isOverdue={session.isOverdue}
      busy={busy}
      onSignOut={() => signOut.mutateAsync().then(() => navigate('/entrar'))}
    >
      <Outlet />
    </PanelLayout>
  );
}

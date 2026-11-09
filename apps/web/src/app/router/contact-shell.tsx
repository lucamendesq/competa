import { Outlet, useNavigate } from 'react-router';
import { useSignOut } from '@/features/auth';
import { ContactLayout } from '@/shared/components/layout/contact-layout';
import { pingDeviceOnce } from '@/shared/pwa';
import { useSession } from '@/shared/session';

export const contactShellLoader = () => {
  void pingDeviceOnce();
  return null;
};

export function ContactShell() {
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();

  return (
    <ContactLayout
      contact={session.contact}
      onSignOut={() => void signOut.mutateAsync().then(() => navigate('/minha-area/acesso'))}
    >
      <Outlet />
    </ContactLayout>
  );
}

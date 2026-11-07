import type { ReactNode } from 'react';
import { useContactProfileQuery, useMeQuery } from '@/features/auth';
import { deriveSession, SessionContext } from '@/shared/session';

export function SessionProvider({ children }: { children: ReactNode }) {
  const me = useMeQuery();
  const contactProfile = useContactProfileQuery({ enabled: me.data === null });

  const loading = me.isPending || (me.data === null && contactProfile.isPending);
  const session = deriveSession({
    status: loading ? 'loading' : 'ready',
    accountant: me.data ?? null,
    contact: me.data ? null : (contactProfile.data ?? null),
  });

  return <SessionContext value={session}>{children}</SessionContext>;
}

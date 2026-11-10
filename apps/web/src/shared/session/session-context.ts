import { createContext, use } from 'react';
import { deriveSession } from '@/shared/session/derive-session';
import type { Session } from '@/shared/session/session.types';

export const SessionContext = createContext<Session>(
  deriveSession({ status: 'loading', accountant: null, contact: null }),
);

export const useSession = () => use(SessionContext);

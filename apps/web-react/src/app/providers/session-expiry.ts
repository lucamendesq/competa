import type { QueryClient } from '@tanstack/react-query';
import type { createBrowserRouter } from 'react-router';
import { toast } from 'sonner';
import { authKeys } from '@/features/auth';
import { areaOf } from '@/app/router/route-handle';
import { onSessionExpired } from '@/shared/lib/api-client';

type AppRouter = Pick<ReturnType<typeof createBrowserRouter>, 'state' | 'navigate'>;

export const SESSION_EXPIRED_MESSAGE = 'Sua sessão foi encerrada. Entre de novo para continuar.';

export const registerSessionExpiry = (queryClient: QueryClient, router: AppRouter) =>
  onSessionExpired(() => {
    const area = areaOf(router.state.matches);
    if (!area) return;

    toast.error(SESSION_EXPIRED_MESSAGE, { id: 'session-expired' });
    queryClient.removeQueries({ queryKey: authKeys.all });
    void router.navigate(area === 'contact' ? '/minha-area/acesso' : '/entrar');
  });

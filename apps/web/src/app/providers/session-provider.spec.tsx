import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SessionProvider } from '@/app/providers/session-provider';
import { authKeys, useSignInAccountant, useSignOut } from '@/features/auth';
import { useSession } from '@/shared/session';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { mockSessionAs } from '@/testing/mocks/sessions';
import { createTestQueryClient } from '@/testing/test-utils';

const authUrl = (path: string) => `http://api.test/api/auth${path}`;

const setup = <Result,>(hook: () => Result) => {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
  return { queryClient, ...renderHook(hook, { wrapper }) };
};

describe('SessionProvider', () => {
  it('fica em loading até o /me responder e can() é false nesse meio tempo', async () => {
    const { result } = setup(() => useSession());

    expect(result.current.status).toBe('loading');
    expect(result.current.can('reminderTuning')).toBe(false);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.accountant?.accountant.name).toBe('Ana Dono');
  });

  it('procura o Responsável só quando não há Contador', async () => {
    mockSessionAs('contact');
    const { result } = setup(() => useSession());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.accountant).toBeNull();
    expect(result.current.contact?.name).toBe('Carla Souza');
  });
});

describe('mutations de sessão', () => {
  it('useSignInAccountant invalida a sessão e o useSession passa a ter o Contador', async () => {
    let signedIn = false;
    server.use(
      http.get(apiUrl('/auth/me'), () =>
        signedIn
          ? HttpResponse.json(envelope(accountantSession()))
          : new HttpResponse(null, { status: 401 }),
      ),
      http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
      http.post(authUrl('/sign-in/email'), () => {
        signedIn = true;
        return HttpResponse.json({ token: 't', user: { id: 'u1', email: 'dono@exemplo.com.br' } });
      }),
    );
    const { result } = setup(() => ({ session: useSession(), signIn: useSignInAccountant() }));
    await waitFor(() => expect(result.current.session.status).toBe('ready'));
    expect(result.current.session.accountant).toBeNull();

    await act(() =>
      result.current.signIn.mutateAsync({
        email: 'dono@exemplo.com.br',
        password: 'senha-forte-123',
      }),
    );

    await waitFor(() =>
      expect(result.current.session.accountant?.accountant.email).toBe('dono@exemplo.com.br'),
    );
  });

  it('useSignInAccountant recusado diz "E-mail ou senha inválidos."', async () => {
    server.use(
      http.post(authUrl('/sign-in/email'), () =>
        HttpResponse.json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' }, { status: 401 }),
      ),
    );
    const { result } = setup(() => useSignInAccountant());

    await expect(
      act(() => result.current.mutateAsync({ email: 'a@b.com', password: 'errada-123' })),
    ).rejects.toThrow('E-mail ou senha inválidos.');
  });

  it('useSignOut limpa o cache inteiro', async () => {
    server.use(http.post(authUrl('/sign-out'), () => HttpResponse.json({ success: true })));
    const { result, queryClient } = setup(() => ({ session: useSession(), signOut: useSignOut() }));
    await waitFor(() => expect(result.current.session.accountant).not.toBeNull());
    queryClient.setQueryData(['companies', 'list'], [{ id: 'empresa-do-tenant' }]);
    mockSessionAs('guest');

    await act(() => result.current.signOut.mutateAsync());

    expect(queryClient.getQueryData(['companies', 'list'])).toBeUndefined();
    await waitFor(() => expect(result.current.session.accountant).toBeNull());
    expect(result.current.session.status).toBe('ready');
    expect(queryClient.getQueryData(authKeys.me()) ?? null).toBeNull();
  });
});

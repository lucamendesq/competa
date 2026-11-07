import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { registerSessionExpiry, SESSION_EXPIRED_MESSAGE } from '@/app/providers/session-expiry';
import { authKeys } from '@/features/auth';
import { api } from '@/shared/lib/api-client';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const routes = [
  { path: '/competencias', handle: { area: 'accountant' }, element: <p>painel</p> },
  { path: '/minha-area/pendencias', handle: { area: 'contact' }, element: <p>minha área</p> },
  { path: '/entrar', element: <p>tela de entrada</p> },
  { path: '/minha-area/acesso', element: <p>acesso do responsável</p> },
  { path: '/termos', element: <p>termos</p> },
];

const mount = (initialEntry: string) => {
  const queryClient = makeQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  registerSessionExpiry(queryClient, router);
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { queryClient, router };
};

const expireTwice = async () => {
  server.use(http.get(apiUrl('/periods'), () => new HttpResponse(null, { status: 401 })));
  await act(async () => {
    await Promise.allSettled([api.get('/periods'), api.get('/periods')]);
  });
};

describe('sessão expirada', () => {
  it('numa rota de Contador leva a /entrar, limpa a sessão do cache e mostra o toast uma vez', async () => {
    const { queryClient, router } = mount('/competencias');
    queryClient.setQueryData(authKeys.me(), { accountant: { name: 'Ana' } });

    await expireTwice();

    expect(await screen.findByText('tela de entrada')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(await screen.findAllByText(SESSION_EXPIRED_MESSAGE)).toHaveLength(1);
    expect(queryClient.getQueryData(authKeys.me())).toBeUndefined();
  });

  it('numa rota do Responsável leva a /minha-area/acesso', async () => {
    const { router } = mount('/minha-area/pendencias');

    await expireTwice();

    expect(await screen.findByText('acesso do responsável')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/minha-area/acesso');
  });

  it('numa rota pública não faz nada', async () => {
    const { router } = mount('/termos');

    await expireTwice();

    expect(router.state.location.pathname).toBe('/termos');
    expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument();
  });
});

describe('ErrorBoundary raiz', () => {
  function Broken(): never {
    throw new Error('quebrou');
  }

  it('mostra "Algo deu errado" em vez de tela branca', () => {
    const silence = console.error;
    console.error = () => undefined;
    render(
      <AppProviders queryClient={makeQueryClient()}>
        <Broken />
      </AppProviders>,
    );
    console.error = silence;

    expect(screen.getByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });
});

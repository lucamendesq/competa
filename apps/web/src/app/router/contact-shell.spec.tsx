import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { contactSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const company = (name: string) => ({
  companyId: crypto.randomUUID(),
  companyName: name,
  accountingFirmName: 'Contabilidade Exemplo',
});

const setup = (companies: ReturnType<typeof company>[] = []) => {
  const state = { signedIn: true, devicePings: 0 };
  server.use(
    http.get(apiUrl('/auth/me'), () => new HttpResponse(null, { status: 401 })),
    http.get(apiUrl('/my/profile'), () =>
      state.signedIn
        ? HttpResponse.json(envelope({ ...contactSession(), companies }))
        : new HttpResponse(null, { status: 401 }),
    ),
    http.patch(apiUrl('/auth/device'), () => {
      state.devicePings += 1;
      return HttpResponse.json(envelope({ ok: true }));
    }),
    http.post(apiUrl('/auth/sign-out'), () => {
      state.signedIn = false;
      return HttpResponse.json({ success: true });
    }),
  );
  const queryClient = makeQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: ['/minha-area/pendencias'] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router, queryClient };
};

beforeEach(() => sessionStorage.clear());

describe('ContactShell', () => {
  it('com uma empresa mostra o nome dela e a Contabilidade, e avisa o dispositivo uma vez', async () => {
    const { state } = setup();

    expect(await screen.findByText('Mercado Bom Preço')).toBeInTheDocument();
    expect(screen.getByText('Contabilidade Exemplo')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'O que falta' }).length).toBeGreaterThan(0);
    await waitFor(() => expect(state.devicePings).toBe(1));
  });

  it('com várias empresas mostra o nome do Responsável e a contagem', async () => {
    setup([company('Mercado Bom Preço'), company('Padaria Pão Quente')]);

    expect(await screen.findByText('Carla Souza')).toBeInTheDocument();
    expect(screen.getByText('2 empresas · Contabilidade Exemplo')).toBeInTheDocument();
  });

  it('sair limpa o cache e vai para /minha-area/acesso', async () => {
    const { router, queryClient } = setup();
    const user = userEvent.setup();
    await screen.findByText('Mercado Bom Preço');
    queryClient.setQueryData(['contact-area', 'periods', 1], [{ cached: true }]);

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/minha-area/acesso'));
    expect(queryClient.getQueryData(['contact-area', 'periods', 1])).toBeUndefined();
  });
});

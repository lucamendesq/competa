import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

describe('fluxo de cadastro', () => {
  it('cadastra em dois passos, cai em /competencias com a sessão nova e o plano em trial', async () => {
    const state = { registered: false, meCalls: 0, body: undefined as unknown };
    server.use(
      http.get(apiUrl('/auth/me'), () => {
        state.meCalls += 1;
        return state.registered
          ? HttpResponse.json(envelope(accountantSession()))
          : new HttpResponse(null, { status: 401 });
      }),
      http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
      http.post(apiUrl('/auth/register'), async ({ request }) => {
        state.body = await request.json();
        state.registered = true;
        return HttpResponse.json(envelope({ ok: true }), { status: 201 });
      }),
      http.get(apiUrl('/billing/subscription'), () =>
        HttpResponse.json(
          envelope({
            planName: 'trial',
            cycle: 'monthly',
            status: 'trialing',
            trialEndsAt: '2099-11-21T00:00:00.000Z',
            currentPeriodEnd: null,
            pendingPlanName: null,
            pendingCycle: null,
            invoiceUrl: null,
          }),
        ),
      ),
      http.get(apiUrl('/companies/usage'), () =>
        HttpResponse.json(
          envelope({
            planName: 'trial',
            companiesActive: 0,
            companiesInactive: 0,
            companyCap: 15,
            softCap: 18,
            overCap: false,
            recommendedPlan: 'profissional',
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: ['/cadastro'] });
    render(
      <AppProviders queryClient={makeQueryClient()}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    await user.type(await screen.findByLabelText(/Seu nome completo/), 'Joana Teste');
    await user.type(screen.getByLabelText(/Seu e-mail profissional/), 'joana@teste.com.br');
    await user.type(screen.getByLabelText(/Senha/), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText(/Nome da Contabilidade/), 'Mendes Contabilidade');
    const meCallsBefore = state.meCalls;
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/competencias'));
    expect(await screen.findByText('Nenhuma competência aberta')).toBeInTheDocument();
    expect(state.meCalls).toBeGreaterThan(meCallsBefore);
    expect(state.body).toMatchObject({
      firmName: 'Mendes Contabilidade',
      email: 'joana@teste.com.br',
    });

    await user.click(screen.getAllByRole('link', { name: 'Plano e Assinatura' })[0]!);
    expect(await screen.findByText('Trial')).toBeInTheDocument();
  });
});

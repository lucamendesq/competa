import { act, render, screen, waitFor } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { registerPaymentRequiredRefresh } from '@/app/providers/payment-required';
import { routes } from '@/app/router/routes';
import { api } from '@/shared/lib/api-client';
import { makeQueryClient } from '@/shared/lib/query-client';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const BANNER = 'Sua assinatura está pendente';

const sessionWith = (status: string) => {
  const session = accountantSession();
  return {
    ...session,
    accountingFirm: {
      ...session.accountingFirm,
      subscription: { ...session.accountingFirm.subscription, status, planName: 'essencial' },
    },
  };
};

const mount = () => {
  const state = { status: 'OVERDUE', meCalls: 0 };
  server.use(
    http.get(apiUrl('/auth/me'), () => {
      state.meCalls += 1;
      return HttpResponse.json(envelope(sessionWith(state.status)));
    }),
    http.get(apiUrl('/billing/subscription'), () =>
      HttpResponse.json(
        envelope({
          planName: 'essencial',
          cycle: 'monthly',
          status: state.status,
          trialEndsAt: null,
          currentPeriodEnd: '2026-12-16T00:00:00.000Z',
          pendingPlanName: null,
          pendingCycle: null,
          invoiceUrl: null,
        }),
      ),
    ),
    http.get(apiUrl('/companies/usage'), () =>
      HttpResponse.json(
        envelope({
          planName: 'essencial',
          companiesActive: 3,
          companiesInactive: 0,
          companyCap: 15,
          softCap: 18,
          overCap: false,
          recommendedPlan: 'profissional',
        }),
      ),
    ),
  );
  const queryClient = makeQueryClient();
  registerPaymentRequiredRefresh(queryClient);
  const router = createMemoryRouter(routes, { initialEntries: ['/configuracoes/plano'] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return state;
};

afterEach(() => focusManager.setFocused(undefined));

describe('sessão após o pagamento', () => {
  it('o aviso de assinatura pendente some quando a aba volta a ter foco', async () => {
    const state = mount();
    expect(await screen.findByText(BANNER)).toBeInTheDocument();

    state.status = 'ACTIVE';
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(screen.queryByText(BANNER)).not.toBeInTheDocument());
    expect(await screen.findByText('Ativa')).toBeInTheDocument();
  });

  it('um 402 PAYMENT_REQUIRED refaz a sessão', async () => {
    const state = mount();
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
    const before = state.meCalls;
    server.use(
      http.post(apiUrl('/companies'), () =>
        HttpResponse.json(
          { error: { code: 'PAYMENT_REQUIRED', message: 'Assinatura pendente.' } },
          { status: 402 },
        ),
      ),
    );
    state.status = 'ACTIVE';

    await act(() => api.post('/companies', {}).catch(() => undefined));

    await waitFor(() => expect(state.meCalls).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText(BANNER)).not.toBeInTheDocument());
  });

  it('um 402 de outro código não refaz a sessão', async () => {
    const state = mount();
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
    const before = state.meCalls;
    server.use(
      http.post(apiUrl('/companies'), () =>
        HttpResponse.json(
          { error: { code: 'PLAN_CAPABILITY_REQUIRED', message: 'Faça upgrade.' } },
          { status: 402 },
        ),
      ),
    );

    await act(() => api.post('/companies', {}).catch(() => undefined));

    expect(state.meCalls).toBe(before);
  });
});

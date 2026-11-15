import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

type Options = {
  owner?: boolean;
  cnpj?: string | null;
  status?: string;
  invoiceUrl?: string | null;
  checkoutUrl?: string | null;
  currentPeriodEnd?: string;
  billing?: Record<string, unknown>;
  checkoutScheduled?: boolean;
};

const setup = (path: string, options: Options = {}) => {
  const { owner = true, cnpj = '11222333000181', status = 'trialing' } = options;
  const state = { checkouts: [] as unknown[], cancels: 0, meCalls: 0, billingCalls: 0 };
  server.use(
    http.get(apiUrl('/auth/me'), () => {
      state.meCalls += 1;
      const session = accountantSession();
      return HttpResponse.json(
        envelope({
          ...session,
          accountant: { ...session.accountant, owner },
          accountingFirm: {
            ...session.accountingFirm,
            cnpj,
            subscription: {
              ...session.accountingFirm.subscription,
              status,
              planName: status === 'ACTIVE' ? 'essencial' : 'trial',
            },
          },
        }),
      );
    }),
    http.get(apiUrl('/billing/subscription'), () => {
      state.billingCalls += 1;
      return HttpResponse.json(
        envelope({
          planName: 'trial',
          cycle: 'monthly',
          status,
          trialEndsAt: null,
          currentPeriodEnd: options.currentPeriodEnd ?? '2026-12-08T00:00:00.000Z',
          pendingPlanName: options.invoiceUrl ? 'profissional' : null,
          pendingCycle: null,
          scheduledPlanName: null,
          scheduledCycle: null,
          scheduledAt: null,
          invoiceUrl: options.invoiceUrl ?? null,
          ...options.billing,
        }),
      );
    }),
    http.get(apiUrl('/companies/usage'), () =>
      HttpResponse.json(
        envelope({
          planName: 'trial',
          companiesActive: 3,
          companiesInactive: 0,
          companyCap: 15,
          softCap: 18,
          overCap: false,
          recommendedPlan: 'profissional',
        }),
      ),
    ),
    http.post(apiUrl('/billing/checkout'), async ({ request }) => {
      state.checkouts.push(await request.json());
      return HttpResponse.json(
        envelope({
          checkoutUrl: options.checkoutUrl ?? null,
          simulated: false,
          applied: false,
          scheduled: options.checkoutScheduled ?? false,
        }),
      );
    }),
    http.delete(apiUrl('/billing/subscription'), () => {
      state.cancels += 1;
      return HttpResponse.json(envelope({ status: 'CANCELED', currentPeriodEnd: null }));
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router };
};

const cardOf = (label: string) =>
  screen.getByText(`Plano ${label}`).closest('[data-slot="card"]') as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('PlanPage', () => {
  it('?plano=essencial destaca o card certo no primeiro render', async () => {
    setup('/configuracoes/plano?plano=essencial');

    await screen.findByText('Plano Essencial');
    expect(within(cardOf('Essencial')).getByText('Recomendado')).toBeInTheDocument();
    expect(within(cardOf('Profissional')).queryByText('Recomendado')).not.toBeInTheDocument();
  });

  it('checkout sem CNPJ não chama a API e aponta para a Contabilidade', async () => {
    const { state } = setup('/configuracoes/plano', { cnpj: null });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Assinar Profissional' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(state.checkouts).toEqual([]);
    expect(screen.getByRole('link', { name: 'configurações da Contabilidade' })).toHaveAttribute(
      'href',
      '/configuracoes/contabilidade',
    );
  });

  it('checkoutUrl fora de asaas.com não redireciona e registra o erro', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { state } = setup('/configuracoes/plano?ciclo=anual', {
      checkoutUrl: 'https://asaas.com.evil.example/pagar',
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Assinar Essencial' }));

    expect(
      await screen.findByText(
        'O link de pagamento recebido não é do Asaas e não foi aberto. Fale com o suporte.',
      ),
    ).toBeInTheDocument();
    expect(state.checkouts).toEqual([{ planName: 'essencial', cycle: 'yearly' }]);
    expect(logged).toHaveBeenCalledWith(
      'checkoutUrl recusada: host fora de asaas.com',
      'https://asaas.com.evil.example/pagar',
    );
  });

  it('fatura em aberto do Asaas vira "Pagar fatura"', async () => {
    setup('/configuracoes/plano', { invoiceUrl: 'https://www.asaas.com/i/abc' });

    expect(await screen.findByRole('link', { name: 'Pagar fatura' })).toHaveAttribute(
      'href',
      'https://www.asaas.com/i/abc',
    );
  });

  it('fatura com host fora do Asaas não vira link', async () => {
    setup('/configuracoes/plano', { invoiceUrl: 'http://asaas.com/i/abc' });

    expect(
      await screen.findByText(
        'O link de pagamento recebido não é do Asaas e não foi aberto. Fale com o suporte.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pagar fatura' })).not.toBeInTheDocument();
  });

  it('cancelar confirma, avisa e refaz a sessão', async () => {
    const { state } = setup('/configuracoes/plano', { status: 'ACTIVE' });
    const user = userEvent.setup();
    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    const before = state.meCalls;

    await user.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar a assinatura?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar assinatura' }));

    expect(await screen.findByText('Assinatura cancelada.')).toBeInTheDocument();
    expect(state.cancels).toBe(1);
    await waitFor(() => expect(state.meCalls).toBeGreaterThan(before));
  });

  it('plano ativo mostra o dia gravado em UTC como fim do período pago', async () => {
    setup('/configuracoes/plano', {
      status: 'ACTIVE',
      currentPeriodEnd: '2026-12-16T00:00:00.000Z',
    });

    expect(await screen.findByText('Período pago até')).toBeInTheDocument();
    expect(screen.getByText('16 de dezembro de 2026')).toBeInTheDocument();
  });

  it('cancelada com período futuro mostra "Acesso até"', async () => {
    setup('/configuracoes/plano', {
      status: 'CANCELED',
      currentPeriodEnd: '2099-12-16T00:00:00.000Z',
    });

    expect(await screen.findByText('Acesso até')).toBeInTheDocument();
    expect(screen.getByText('16 de dezembro de 2099')).toBeInTheDocument();
  });

  it('cancelada com período vencido diz que o acesso encerrou', async () => {
    setup('/configuracoes/plano', {
      status: 'CANCELED',
      currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    });

    expect(await screen.findByText('Encerrado em 01 de novembro de 2026')).toBeInTheDocument();
  });

  it('atrasada com período vencido diz que o acesso encerrou', async () => {
    setup('/configuracoes/plano', {
      status: 'OVERDUE',
      currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    });

    expect(await screen.findByText('Encerrado em 01 de novembro de 2026')).toBeInTheDocument();
  });

  it('membro vê somente leitura e os botões de assinar desabilitados', async () => {
    setup('/configuracoes/plano', { owner: false });

    expect(await screen.findByText('Somente leitura')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assinar Profissional' })).toBeDisabled();
  });

  describe('troca agendada para um plano mais barato', () => {
    const scheduledBilling = {
      planName: 'profissional',
      cycle: 'monthly',
      status: 'ACTIVE',
      scheduledPlanName: 'essencial',
      scheduledCycle: 'yearly',
      scheduledAt: '2026-12-01T00:00:00.000Z',
    };

    it('mostra o plano novo, o ciclo e a data no dia UTC do vencimento', async () => {
      setup('/configuracoes/plano', { status: 'ACTIVE', billing: scheduledBilling });

      const notice = (await screen.findByText(/Seu plano muda para/)).closest('p') as HTMLElement;
      expect(notice).toHaveTextContent(
        'Seu plano muda para Essencial (anual) em 01 de dezembro de 2026',
      );
      expect(notice).toHaveTextContent('recursos do plano Essencial');
    });

    it('sem troca agendada não mostra o aviso', async () => {
      setup('/configuracoes/plano', { status: 'ACTIVE' });

      await screen.findByText('Ativa');
      expect(screen.queryByText(/Seu plano muda para/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Manter o plano atual' }),
      ).not.toBeInTheDocument();
    });

    it('"Manter o plano atual" escolhe o plano e o ciclo atuais e refaz a consulta', async () => {
      const { state } = setup('/configuracoes/plano', {
        status: 'ACTIVE',
        billing: scheduledBilling,
      });
      const user = userEvent.setup();
      const before = state.billingCalls;

      await user.click(await screen.findByRole('button', { name: 'Manter o plano atual' }));

      expect(
        await screen.findByText('Troca cancelada: você continua no plano atual.'),
      ).toBeInTheDocument();
      expect(state.checkouts).toEqual([{ planName: 'profissional', cycle: 'monthly' }]);
      await waitFor(() => expect(state.billingCalls).toBeGreaterThan(before));
    });

    it('membro vê o aviso mas não o botão de manter o plano', async () => {
      setup('/configuracoes/plano', {
        owner: false,
        status: 'ACTIVE',
        billing: scheduledBilling,
      });

      expect(await screen.findByText(/Seu plano muda para/)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Manter o plano atual' }),
      ).not.toBeInTheDocument();
    });

    it('checkout agendado avisa que vale na renovação e refaz a consulta, sem redirecionar', async () => {
      const { state } = setup('/configuracoes/plano', {
        status: 'ACTIVE',
        checkoutScheduled: true,
      });
      const user = userEvent.setup();
      await screen.findByText('Ativa');
      const before = state.billingCalls;

      await user.click(await screen.findByRole('button', { name: 'Assinar Profissional' }));

      expect(
        await screen.findByText(
          /Troca agendada: o plano atual segue valendo até o fim do período pago/,
        ),
      ).toBeInTheDocument();
      await waitFor(() => expect(state.billingCalls).toBeGreaterThan(before));
    });
  });
});

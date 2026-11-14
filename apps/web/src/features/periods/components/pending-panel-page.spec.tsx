import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { panelRow } from '@/testing/factories/panel-row';
import { period } from '@/testing/factories/period';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const PERIOD_ID = '00000000-0000-4000-8000-0000000000aa';

const mercado = () =>
  panelRow({
    companyId: '00000000-0000-4000-8000-0000000000c1',
    companyName: 'Mercado Bom Preço',
    requestId: '00000000-0000-4000-8000-0000000000d1',
    responsibleAccountantId: '00000000-0000-4000-8000-0000000000e1',
    responsibleAccountantName: 'Bruno Membro',
    counts: { pending: 1, submitted: 0, accepted: 1, rejected: 0 },
    missing: [
      {
        id: '00000000-0000-4000-8000-0000000000f1',
        name: 'Extrato bancário',
        status: 'pending',
        dueDate: '2099-01-10',
        resent: false,
      },
    ],
  });

const oficina = (status: 'open' | 'closed' = 'open') =>
  panelRow({
    pendingExtraCount: 2,
    companyId: '00000000-0000-4000-8000-0000000000c2',
    companyName: 'Oficina Roda Viva',
    requestId: '00000000-0000-4000-8000-0000000000d2',
    requestStatus: status,
    responsibleAccountantId: null,
    responsibleAccountantName: null,
    counts: { pending: 2, submitted: 0, accepted: 0, rejected: 0 },
    missing: [
      {
        id: '00000000-0000-4000-8000-0000000000f2',
        name: 'Guia DAS',
        status: 'pending',
        dueDate: '2020-01-10',
        resent: false,
      },
      {
        id: '00000000-0000-4000-8000-0000000000f3',
        name: 'Folha',
        status: 'pending',
        dueDate: null,
        resent: false,
      },
    ],
    channelFailures: [
      {
        requestId: '00000000-0000-4000-8000-0000000000d2',
        channel: 'email',
        purpose: 'reminder',
        recipient: 'diego@oficina.com.br',
        error: 'caixa cheia',
        createdAt: '2026-11-07T10:00:00Z',
      },
    ],
  });

const setup = (state = { oficinaClosed: false, panelCalls: 0 }) => {
  server.use(
    http.get(apiUrl(`/periods/${PERIOD_ID}`), () =>
      HttpResponse.json(
        envelope({
          ...period({ id: PERIOD_ID, referenceMonth: '2026-11-01' }),
          completeRequestCount: 0,
          pendingItemCount: 3,
          deliveredCount: 0,
        }),
      ),
    ),
    http.get(apiUrl(`/periods/${PERIOD_ID}/pending-panel`), () => {
      state.panelCalls += 1;
      return HttpResponse.json(
        envelope([mercado(), oficina(state.oficinaClosed ? 'closed' : 'open')]),
      );
    }),
    http.get(apiUrl('/companies'), () =>
      HttpResponse.json({
        data: [{ id: '00000000-0000-4000-8000-0000000000c1', cnpj: '11222333000181' }],
        meta: { page: 1, perPage: 100, total: 1 },
      }),
    ),
  );
  return state;
};

const mount = (path = `/competencias/${PERIOD_ID}/pendencias`) => {
  const router = createMemoryRouter(routes, {
    initialEntries: ['/competencias', path],
    initialIndex: 1,
  });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
};

describe('PendingPanelPage', () => {
  it('mostra as Empresas com CNPJ, atraso e a falha de canal ao expandir', async () => {
    setup();
    const user = userEvent.setup();
    mount();

    expect(
      await screen.findByRole('heading', {
        name: 'Cobrança da competência Novembro/2026',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('11.222.333/0001-81')).toBeInTheDocument();
    expect(screen.getByText('Atrasada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Oficina Roda Viva' }));

    expect(screen.getByText('Falha na entrega de notificações (e-mail)')).toBeInTheDocument();
    expect(screen.getByText('Aguardando Envio (2)')).toBeInTheDocument();
  });

  it('"Cobrar atrasados" com busy avisa que já há cobrança em andamento', async () => {
    setup();
    server.use(
      http.post(apiUrl('/messages/reminders/run'), () =>
        HttpResponse.json(envelope({ scanned: 0, sent: 0, busy: true })),
      ),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Cobrar atrasados' }));

    expect(
      await screen.findByText('Já há uma cobrança em andamento. Confira em instantes.'),
    ).toBeInTheDocument();
  });

  it('"Cobrar atrasados" com envios mostra a contagem e refaz o painel', async () => {
    const state = setup();
    server.use(
      http.post(apiUrl('/messages/reminders/run'), () =>
        HttpResponse.json(envelope({ scanned: 3, sent: 2, busy: false })),
      ),
    );
    const user = userEvent.setup();
    mount();
    await screen.findByRole('button', { name: 'Cobrar atrasados' });
    const before = state.panelCalls;

    await user.click(screen.getByRole('button', { name: 'Cobrar atrasados' }));

    expect(
      await screen.findByText(
        '2 lembrete(s) enviado(s). As outras 1 Solicitação(ões) já foram cobradas há poucos dias, atingiram o limite de lembretes ou ainda estão longe do prazo.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(state.panelCalls).toBe(before + 1));
  });

  it('encerrar a Solicitação de uma linha atualiza a linha sem recarregar', async () => {
    const state = setup();
    server.use(
      http.post(apiUrl('/requests/00000000-0000-4000-8000-0000000000d2/close'), () => {
        state.oficinaClosed = true;
        return HttpResponse.json(
          envelope({
            id: '00000000-0000-4000-8000-0000000000d2',
            status: 'closed',
            pendingItemCount: 2,
            warning: null,
          }),
        );
      }),
    );
    const user = userEvent.setup();
    mount();

    await user.click(
      await screen.findByRole('button', { name: 'Encerrar a solicitação de Oficina Roda Viva' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Encerrar a solicitação de Oficina Roda Viva?',
    });
    expect(within(dialog).getByText(/item\(ns\) ainda sem aceite/)).toHaveTextContent(
      '2 item(ns) ainda sem aceite.',
    );
    expect(within(dialog).getByText(/documento\(s\) extra\(s\)/)).toHaveTextContent(
      '2 documento(s) extra(s) ainda não conferido(s).',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar solicitação' }));

    expect(
      await screen.findByText('Solicitação de Oficina Roda Viva encerrada.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Encerrar a solicitação de Oficina Roda Viva' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('Solicitação encerrada com extras pendentes sinaliza na linha que ficam fora do zip', async () => {
    setup({ oficinaClosed: true, panelCalls: 0 });
    mount();

    expect(
      await screen.findByText(/extra\(s\) aguardando conferência — fora do zip até serem aceitos/),
    ).toHaveTextContent(
      '2 documento(s) extra(s) aguardando conferência — fora do zip até serem aceitos',
    );
  });

  it('encerrar a competência avisa quantos extras abertos ficam fora do zip final', async () => {
    setup();
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Encerrar competência?' });
    expect(within(dialog).getByText(/documento\(s\)\s+extra\(s\)/)).toHaveTextContent(
      '2 documento(s) extra(s) ainda não conferido(s).',
    );
  });

  it('copiar link gera um novo, mostra o toast e marca o botão por 2,5 s', async () => {
    setup();
    server.use(
      http.post(apiUrl('/requests/00000000-0000-4000-8000-0000000000d1/upload-link'), () =>
        HttpResponse.json(
          envelope({
            uploadUrl: 'http://localhost/envio/novo',
            contactEmail: 'carla@mercado.com.br',
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('Mercado Bom Preço')).closest('li')!;

    await user.click(within(row).getByRole('button', { name: 'Copiar link' }));

    expect(
      await screen.findByText(
        'Novo link de Mercado Bom Preço copiado. O link anterior continua valendo por até 48 h.',
      ),
    ).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Link copiado!' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('http://localhost/envio/novo');
    await waitFor(
      () => expect(within(row).getByRole('button', { name: 'Copiar link' })).toBeInTheDocument(),
      {
        timeout: 3500,
      },
    );
  });

  it('?contador= filtra, sobrevive ao reload e à navegação de volta', async () => {
    setup();
    const user = userEvent.setup();
    const router = mount();
    const select = await screen.findByRole('combobox', { name: 'Contador responsável' });

    await user.selectOptions(select, '00000000-0000-4000-8000-0000000000e1');

    expect(router.state.location.search).toBe('?contador=00000000-0000-4000-8000-0000000000e1');
    expect(screen.queryByText('Oficina Roda Viva')).not.toBeInTheDocument();

    await act(() => router.navigate('/competencias'));
    await act(() => router.navigate(-1));
    expect(await screen.findByRole('combobox', { name: 'Contador responsável' })).toHaveValue(
      '00000000-0000-4000-8000-0000000000e1',
    );
    expect(screen.queryByText('Oficina Roda Viva')).not.toBeInTheDocument();
  });

  it('abre direto com ?contador= na URL (reload)', async () => {
    setup();
    mount(`/competencias/${PERIOD_ID}/pendencias?contador=unassigned`);

    expect(await screen.findByText('Oficina Roda Viva')).toBeInTheDocument();
    expect(screen.queryByText('Mercado Bom Preço')).not.toBeInTheDocument();
  });
});

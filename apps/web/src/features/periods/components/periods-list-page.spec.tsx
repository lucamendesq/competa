import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { period } from '@/testing/factories/period';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const withPeriodZip = () => {
  const me = accountantSession();
  me.accountingFirm.plan.capabilities = ['periodZip'] as never[];
  server.use(http.get(apiUrl('/auth/me'), () => HttpResponse.json(envelope(me))));
};

const mount = (path = '/competencias') => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
};

const pageOf = (rows: ReturnType<typeof period>[], page = 1, total = rows.length) =>
  HttpResponse.json({ data: rows, meta: { page, perPage: 20, total } });

describe('PeriodsListPage', () => {
  it('sem competências mostra o vazio com a chamada para abrir', async () => {
    mount();

    expect(await screen.findByText('Nenhuma competência aberta')).toBeInTheDocument();
  });

  it('abre a competência com o body certo, mostra o resumo e refaz a lista', async () => {
    let listCalls = 0;
    let posted: unknown;
    server.use(
      http.get(apiUrl('/periods'), () => {
        listCalls += 1;
        return pageOf([]);
      }),
      http.get(apiUrl('/periods/preview'), () =>
        HttpResponse.json(
          envelope({
            existingPeriodId: null,
            requests: [
              {
                companyId: 'c1',
                companyName: 'Mercado Bom Preço',
                contactName: 'Carla',
                itemCount: 16,
              },
            ],
            skipped: [
              {
                companyId: 'c2',
                companyName: 'Padaria Pão Quente',
                reason: 'x',
                blockedBy: 'template',
              },
            ],
            notes: [],
          }),
        ),
      ),
      http.post(apiUrl('/periods'), async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          envelope({
            id: 'p1',
            referenceMonth: '2026-10-01',
            status: 'open',
            dueDate: null,
            warnings: [],
            requests: [
              {
                id: 'r1',
                companyId: 'c1',
                companyName: 'Mercado Bom Preço',
                itemCount: 16,
                uploadUrl: 'http://x/envio/t',
              },
            ],
          }),
        );
      }),
    );
    const user = userEvent.setup();
    mount();
    await screen.findByText('Nenhuma competência aberta');

    await user.click(screen.getAllByRole('button', { name: /Abrir competência/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Abrir nova competência' });
    await within(dialog).findByText('Padaria Pão Quente');
    await user.selectOptions(within(dialog).getByLabelText('Mês', { selector: 'select' }), '10');
    await user.selectOptions(within(dialog).getByLabelText('Ano', { selector: 'select' }), '2026');
    await user.click(within(dialog).getByRole('button', { name: 'Revisar envios' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar e enviar 1 e-mails' }));

    expect(await within(dialog).findByText('Competência aberta com sucesso')).toBeInTheDocument();
    expect(posted).toEqual({ referenceMonth: '2026-10' });
    expect(
      await screen.findByText('Competência aberta. 1 link enviado por e-mail.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBe(2));
  });

  it('trocar de página escreve ?page= e mantém a lista anterior enquanto carrega', async () => {
    server.use(
      http.get(apiUrl('/periods'), async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        if (page === 2) {
          await delay(200);
          return pageOf(
            [period({ id: 'p-old', referenceMonth: '2024-01-01', status: 'closed' })],
            2,
            21,
          );
        }
        return pageOf(
          [period({ id: 'p-new', referenceMonth: '2026-10-01', status: 'closed' })],
          1,
          21,
        );
      }),
    );
    const user = userEvent.setup();
    const router = mount();
    await screen.findByRole('link', { name: 'Outubro/2026' });

    await user.click(screen.getByRole('button', { name: '2' }));

    expect(router.state.location.search).toBe('?page=2');
    expect(screen.getByRole('link', { name: 'Outubro/2026' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Janeiro/2024' })).toBeInTheDocument();
  });

  it('encerrar pede confirmação e desabilita o botão enquanto encerra', async () => {
    let closed = false;
    server.use(
      http.get(apiUrl('/periods'), () =>
        pageOf([
          period({ id: 'p1', referenceMonth: '2026-10-01', status: closed ? 'closed' : 'open' }),
        ]),
      ),
      http.get(apiUrl('/periods/p1'), () =>
        HttpResponse.json(
          envelope({
            ...period({ id: 'p1' }),
            completeRequestCount: 0,
            pendingItemCount: 0,
            deliveredCount: 0,
          }),
        ),
      ),
      http.post(apiUrl('/periods/p1/close'), async () => {
        await delay(100);
        closed = true;
        return HttpResponse.json(envelope({ id: 'p1', warning: null }));
      }),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Encerrar Outubro/2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Encerrar competência?' });
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar competência' }));

    expect(within(dialog).getByRole('button', { name: 'Encerrando…' })).toBeDisabled();
    expect(await screen.findByText('Competência encerrada.')).toBeInTheDocument();
  });

  it('zip sem documentos vira o toast "Nenhum documento para baixar."', async () => {
    withPeriodZip();
    server.use(
      http.get(apiUrl('/periods'), () =>
        pageOf([period({ id: 'p1', referenceMonth: '2026-10-01', status: 'closed' })]),
      ),
      http.get(
        apiUrl('/periods/p1/zip'),
        () => new HttpResponse('', { headers: { 'Content-Type': 'application/zip' } }),
      ),
    );
    const user = userEvent.setup();
    mount();

    await user.click(
      await screen.findByRole('button', { name: 'Baixar .zip de todas as empresas' }),
    );

    expect(await screen.findByText('Nenhum documento para baixar.')).toBeInTheDocument();
  });

  it('sem a capability periodZip o zip fica desabilitado com o aviso do plano', async () => {
    server.use(
      http.get(apiUrl('/periods'), () => pageOf([period({ id: 'p1', status: 'closed' })])),
    );
    mount();

    await screen.findByRole('link', { name: 'Novembro/2026' });
    await act(async () => undefined);
    expect(screen.getByText(/Baixar o zip da competência inteira/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disponível a partir do plano/ })).toBeDisabled();
  });
});

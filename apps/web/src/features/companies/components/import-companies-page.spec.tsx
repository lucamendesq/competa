import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const NEW_ID = '00000000-0000-4000-8000-000000000c09';
const body = { name: 'Padaria', flags: {} };

const setup = ({ softCap = 30, companiesActive = 2 } = {}) => {
  const state = { csv: '', confirmed: [] as unknown[], invited: [] as unknown[] };
  server.use(
    http.get(apiUrl('/companies/usage'), () =>
      HttpResponse.json(
        envelope({
          planName: 'essencial',
          companiesActive,
          companiesInactive: 0,
          companyCap: softCap,
          softCap,
          overCap: false,
          recommendedPlan: 'profissional',
        }),
      ),
    ),
    http.post(apiUrl('/companies/import'), async ({ request }) => {
      state.csv = ((await request.json()) as { csv: string }).csv;
      return HttpResponse.json(
        envelope({
          total: 2,
          failed: 1,
          lines: [
            { line: 2, status: 'pending', name: 'Padaria', body },
            { line: 3, status: 'error', name: 'Sem nome', error: 'Informe o nome da Empresa.' },
          ],
        }),
      );
    }),
    http.post(apiUrl('/companies/import/confirm'), async ({ request }) => {
      state.confirmed.push(await request.json());
      return HttpResponse.json(
        envelope({
          total: 1,
          created: 1,
          updated: 0,
          activated: 1,
          failed: 0,
          lines: [
            {
              line: 2,
              status: 'created',
              companyId: NEW_ID,
              name: 'Padaria',
              active: true,
              inserted: true,
            },
          ],
        }),
      );
    }),
    http.post(apiUrl('/companies/access-invites'), async ({ request }) => {
      state.invited.push(await request.json());
      return HttpResponse.json(
        envelope({
          invited: 0,
          skipped: 1,
          results: [{ companyId: NEW_ID, status: 'skipped', reason: 'Empresa sem Responsável.' }],
        }),
      );
    }),
    http.get(apiUrl('/companies'), () =>
      HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0 } }),
    ),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/empresas/importar'] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router };
};

const upload = async (user: ReturnType<typeof userEvent.setup>, file: File) => {
  await user.upload(await screen.findByLabelText('Escolher arquivo'), file);
};

describe('ImportCompaniesPage', () => {
  it('lê o CSV, mostra a prévia por linha e confirma ativando as que cabem', async () => {
    const { state, router } = setup();
    const user = userEvent.setup();

    await upload(user, new File(['Empresa\nPadaria\n'], 'carteira.csv', { type: 'text/csv' }));
    expect(await screen.findByText('carteira.csv pronto para importar.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importar empresas' }));

    expect(await screen.findByText('Resumo da importação')).toBeInTheDocument();
    expect(state.csv).toBe('Empresa\nPadaria\n');
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('Pronta')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Informe o nome da Empresa.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ativar as que couberem/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Importar 1 empresa' }));

    expect(
      await screen.findByText('1 empresa nova — 1 ativa(s), 0 inativa(s).'),
    ).toBeInTheDocument();
    expect(state.confirmed[0]).toEqual({ pending: [{ line: 2, body }], activate: true });
    await waitFor(() => expect(router.state.location.pathname).toBe('/empresas'));
  });

  it('lote acima do teto desmarca "ativar" e enviar convites confirma uma vez só', async () => {
    const { state } = setup({ softCap: 2, companiesActive: 2 });
    const user = userEvent.setup();

    await upload(user, new File(['Empresa\nPadaria\n'], 'carteira.csv'));
    await user.click(await screen.findByRole('button', { name: 'Importar empresas' }));
    const activate = await screen.findByRole('checkbox', { name: /Ativar as que couberem/ });
    await waitFor(() => expect(activate).not.toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Enviar convites de acesso (1)' }));

    expect(await screen.findByText('0 convites enviados.')).toBeInTheDocument();
    expect(screen.getByText('1 sem convite — Empresa sem Responsável.')).toBeInTheDocument();
    expect(state.confirmed).toEqual([{ pending: [{ line: 2, body }], activate: false }]);
    expect(state.invited).toEqual([{ companyIds: [NEW_ID] }]);
    expect(screen.getByText('Importada')).toBeInTheDocument();
  });

  it('extensão desconhecida mostra o erro e não libera a importação', async () => {
    setup();
    const user = userEvent.setup({ applyAccept: false });

    await upload(user, new File(['x'], 'carteira.pdf'));

    expect(await screen.findByText('Envie um arquivo .csv ou .xlsx.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar empresas' })).toBeDisabled();
  });

  it('trocar de planilha antes de confirmar pede para descartar', async () => {
    setup();
    const user = userEvent.setup();

    await upload(user, new File(['Empresa\nPadaria\n'], 'carteira.csv'));
    await user.click(await screen.findByRole('button', { name: 'Importar empresas' }));
    await user.click(await screen.findByRole('button', { name: 'Importar outra planilha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Descartar esta planilha?' });
    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }));

    expect(
      await screen.findByText('Escolha a planilha acima para liberar a importação.'),
    ).toBeInTheDocument();
  });
});

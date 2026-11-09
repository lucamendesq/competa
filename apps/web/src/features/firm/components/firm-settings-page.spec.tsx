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

const firm = {
  id: '00000000-0000-4000-8000-000000000f01',
  name: 'Contabilidade Exemplo',
  reminderMax: 4,
  reminderDueSoonDays: 5,
  reminderGapDays: 2,
  logoUrl: null,
  contactEmail: null,
  cnpj: null,
};

const setup = ({ owner = true, capabilities = ['reminderTuning', 'branding'] } = {}) => {
  const state = { firmName: firm.name, patches: [] as unknown[] };
  server.use(
    http.get(apiUrl('/auth/me'), () => {
      const session = accountantSession();
      return HttpResponse.json(
        envelope({
          ...session,
          accountant: { ...session.accountant, owner },
          accountingFirm: {
            ...session.accountingFirm,
            name: state.firmName,
            plan: { ...session.accountingFirm.plan, capabilities },
          },
        }),
      );
    }),
    http.get(apiUrl('/accounting-firm'), () =>
      HttpResponse.json(envelope({ ...firm, name: state.firmName })),
    ),
    http.patch(apiUrl('/accounting-firm'), async ({ request }) => {
      const body = (await request.json()) as { name?: string };
      state.patches.push(body);
      if (body.name) state.firmName = body.name;
      return HttpResponse.json(envelope({ ...firm, name: state.firmName }));
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/configuracoes/contabilidade'] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return state;
};

describe('FirmSettingsPage', () => {
  it('dono salva só o que mudou e o nome muda no menu sem recarregar', async () => {
    const state = setup();
    const user = userEvent.setup();
    const nameInput = await screen.findByLabelText('Nome da Contabilidade');
    expect(screen.getByLabelText('Máximo de lembretes por item')).toHaveValue(4);

    await user.clear(nameInput);
    await user.type(nameInput, 'Escritório Novo');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
    expect(state.patches).toEqual([{ name: 'Escritório Novo' }]);
    await waitFor(() =>
      expect(
        screen.getAllByText('Escritório Novo', { selector: 'span, p' }).length,
      ).toBeGreaterThan(0),
    );
  });

  it('lembrete apagado pede para preencher e não salva', async () => {
    const state = setup();
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText('Intervalo mínimo entre lembretes (dias)'));
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    expect(await screen.findByText('Preencha este campo.')).toBeInTheDocument();
    expect(state.patches).toEqual([]);
  });

  it('sem mudança avisa "Nada para salvar."', async () => {
    const state = setup();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Salvar configurações' }));

    expect(await screen.findByText('Nada para salvar.')).toBeInTheDocument();
    expect(state.patches).toEqual([]);
  });

  it('membro vê campos desabilitados, o aviso e o gate de plano sem reminderTuning', async () => {
    setup({ owner: false, capabilities: [] });

    expect(await screen.findByText('Somente leitura')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da Contabilidade')).toBeDisabled();
    expect(screen.getByLabelText('Máximo de lembretes por item')).toHaveValue(2);
    expect(screen.getByText(/Ajustar a cadência dos lembretes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar configurações' })).not.toBeInTheDocument();
  });
});

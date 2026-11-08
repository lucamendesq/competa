import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const MEMBER_ID = '00000000-0000-4000-8000-000000000a12';
const INVITE_URL = 'http://localhost:5174/convite/abc123';

const setup = () => {
  const state = {
    invites: [] as { id: string; email: string; expiresAt: string }[],
    inviteGets: 0,
  };
  server.use(
    http.get(apiUrl('/accountants'), () =>
      HttpResponse.json(
        envelope([
          {
            id: '00000000-0000-4000-8000-000000000a11',
            name: 'Ana Dono',
            email: 'dono@exemplo.com.br',
            owner: true,
            createdAt: '2026-11-01T00:00:00.000Z',
          },
          {
            id: MEMBER_ID,
            name: 'Bruno Membro',
            email: 'membro@exemplo.com.br',
            owner: false,
            createdAt: '2026-11-02T00:00:00.000Z',
          },
        ]),
      ),
    ),
    http.get(apiUrl('/invites'), () => {
      state.inviteGets += 1;
      return HttpResponse.json(envelope(state.invites));
    }),
    http.post(apiUrl('/invites'), async ({ request }) => {
      const { email } = (await request.json()) as { email: string };
      state.invites.push({ id: 'i1', email, expiresAt: '2026-11-15T12:00:00.000Z' });
      return HttpResponse.json(envelope({ id: 'i1', email, url: INVITE_URL }));
    }),
    http.delete(apiUrl(`/accountants/${MEMBER_ID}`), () =>
      HttpResponse.json(
        {
          error: {
            code: 'CANNOT_REMOVE_OWNER',
            message: 'O dono da Contabilidade não pode ser removido.',
          },
        },
        { status: 422 },
      ),
    ),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/configuracoes/contadores'] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return state;
};

describe('AccountantsSettingsPage', () => {
  it('criar convite mostra a URL com copiar e refaz a lista de convites', async () => {
    const state = setup();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await screen.findByText('Nenhum convite aguardando aceite.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Convidar contador' }));
    const dialog = await screen.findByRole('dialog', { name: 'Convidar contador' });
    await user.type(within(dialog).getByLabelText('E-mail'), 'nova@exemplo.com.br');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));

    expect(await within(dialog).findByText(INVITE_URL)).toBeInTheDocument();
    expect(screen.getByText('Convite enviado para nova@exemplo.com.br.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Copiar link' }));
    expect(writeText).toHaveBeenCalledWith(INVITE_URL);
    await waitFor(() => expect(state.inviteGets).toBeGreaterThan(1));
    expect(await screen.findByText('nova@exemplo.com.br')).toBeInTheDocument();
  });

  it('e-mail inválido mostra o erro do contrato e não envia', async () => {
    const state = setup();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Convidar contador' }));
    const dialog = await screen.findByRole('dialog', { name: 'Convidar contador' });
    await user.type(within(dialog).getByLabelText('E-mail'), 'nao-e-email');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));

    expect(await within(dialog).findByText('E-mail inválido.')).toBeInTheDocument();
    expect(state.invites).toEqual([]);
  });

  it('remover mostra a mensagem do 422 do servidor, não uma genérica', async () => {
    setup();
    const user = userEvent.setup();

    expect(screen.queryByRole('button', { name: 'Remover Ana Dono' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Remover Bruno Membro' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover contador?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));

    expect(
      await screen.findByText('O dono da Contabilidade não pode ser removido.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível remover o contador.')).not.toBeInTheDocument();
  });
});

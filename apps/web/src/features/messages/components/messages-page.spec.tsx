import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const MESSAGE_ID = '00000000-0000-4000-8000-000000000e01';

const message = (status: string, error: string | null = null) => ({
  id: MESSAGE_ID,
  requestId: '00000000-0000-4000-8000-000000000e02',
  periodId: '00000000-0000-4000-8000-000000000e03',
  companyName: 'Oficina Roda Viva',
  channel: 'whatsapp',
  purpose: 'reminder',
  recipient: '+5511988887777',
  status,
  sentAt: null,
  error,
  createdAt: '2026-11-05T12:00:00.000Z',
});

const setup = (path: string) => {
  const state = { queries: [] as string[], resent: 0 };
  server.use(
    http.get(apiUrl('/messages'), ({ request }) => {
      state.queries.push(new URL(request.url).search);
      return HttpResponse.json({
        data: [state.resent ? message('sent') : message('failed', 'Número sem WhatsApp')],
        meta: { page: 1, perPage: 20, total: 1 },
      });
    }),
    http.get(apiUrl('/companies'), () =>
      HttpResponse.json({ data: [], meta: { page: 1, perPage: 100, total: 0 } }),
    ),
    http.post(apiUrl(`/messages/${MESSAGE_ID}/resend`), () => {
      state.resent += 1;
      return HttpResponse.json(envelope({ sent: true }));
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

describe('MessagesPage', () => {
  it('mostra o erro de entrega e reenviar avisa e refaz a lista', async () => {
    const { state } = setup('/mensagens');
    const user = userEvent.setup();

    expect(await screen.findByText('Número sem WhatsApp')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reenviar mensagem' }));

    expect(await screen.findByText('Mensagem reenviada para +5511988887777.')).toBeInTheDocument();
    expect(state.resent).toBe(1);
    await waitFor(() => expect(screen.queryByText('Número sem WhatsApp')).not.toBeInTheDocument());
    expect(state.queries.length).toBeGreaterThan(1);
  });

  it('trocar o tipo com canal e página na URL volta para a página 1 e mantém o canal', async () => {
    const { state, router } = setup('/mensagens?canal=whatsapp&page=3');
    const user = userEvent.setup();
    await screen.findByText('Oficina Roda Viva');
    expect(state.queries[0]).toContain('page=3');
    expect(state.queries[0]).toContain('channel=whatsapp');

    await user.selectOptions(screen.getByLabelText('Tipo'), 'reminder');

    const params = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(params)).toEqual({ canal: 'whatsapp', page: '1', tipo: 'reminder' });
    await waitFor(() => expect(state.queries.at(-1)).toContain('purpose=reminder'));
    expect(state.queries.at(-1)).toContain('page=1');
  });

  it('page=abc na URL carrega a página 1', async () => {
    const { state } = setup('/mensagens?page=abc');

    expect(await screen.findByText('Oficina Roda Viva')).toBeInTheDocument();
    expect(state.queries[0]).toContain('page=1');
  });
});

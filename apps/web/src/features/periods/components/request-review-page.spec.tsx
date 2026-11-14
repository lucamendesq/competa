import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { request } from '@/testing/factories/request';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REQUEST_ID = uuid(900);
const PERIOD_ID = uuid(901);

const document = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: uuid(n),
  requestItemId: null,
  fileName: `arquivo-${n}.pdf`,
  sizeBytes: 2048,
  uploadedAt: '2026-11-07T10:00:00.000Z',
  reviewStatus: 'pending' as const,
  rejectionReason: null,
  uploadedByContactId: null,
  ...overrides,
});

const detail = (status: 'open' | 'closed' = 'open') =>
  request({
    id: REQUEST_ID,
    status,
    periodId: PERIOD_ID,
    companyName: 'Mercado Bom Preço',
    items: [
      {
        id: uuid(1),
        name: 'Aluguel',
        description: null,
        status: 'submitted',
        dueDate: null,
        acceptedFormats: ['pdf'],
        documents: [document(11)],
      },
      {
        id: uuid(2),
        name: 'Atestados',
        description: null,
        status: 'submitted',
        dueDate: null,
        acceptedFormats: ['pdf'],
        documents: [document(12)],
      },
      {
        id: uuid(3),
        name: 'Folha',
        description: null,
        status: 'accepted',
        dueDate: null,
        acceptedFormats: ['pdf'],
        documents: [document(13, { reviewStatus: 'accepted' })],
      },
    ],
    extraDocuments: [document(14, { fileName: 'extra.pdf' })],
  });

const mount = (status: 'open' | 'closed' = 'open') => {
  let detailCalls = 0;
  let posted: unknown;
  server.use(
    http.get(apiUrl(`/requests/${REQUEST_ID}`), () => {
      detailCalls += 1;
      return HttpResponse.json(envelope(detail(status)));
    }),
    http.post(apiUrl(`/requests/${REQUEST_ID}/review`), async ({ request: req }) => {
      posted = await req.json();
      return HttpResponse.json(
        envelope({
          requestId: REQUEST_ID,
          requestStatus: 'open',
          completed: false,
          acceptedItems: 1,
          rejectedDocuments: 1,
          linkRotated: true,
          emailSent: true,
        }),
      );
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [`/solicitacoes/${REQUEST_ID}`] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { calls: () => detailCalls, posted: () => posted };
};

describe('RequestReviewPage', () => {
  it('publica o lote com aceites, recusas e extras, zera o rascunho e refaz o detalhe', async () => {
    const user = userEvent.setup();
    const state = mount();

    await user.click(await screen.findByRole('button', { name: 'Aceitar item: Aluguel' }));
    await user.click(screen.getByRole('button', { name: 'Recusar: arquivo-12.pdf' }));
    expect(screen.getByRole('status')).toHaveTextContent('— informe o motivo das recusas');
    expect(screen.getByRole('button', { name: 'Publicar revisão' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('Motivo da recusa (o Responsável recebe este texto)'),
      'Arquivo ilegível',
    );
    await user.click(screen.getByRole('button', { name: 'Aceitar: extra.pdf' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 decisão(ões) não publicada(s)');
    const before = state.calls();

    await user.click(screen.getByRole('button', { name: 'Publicar revisão' }));

    expect(
      await screen.findByText('Revisão publicada: 1 aceite(s), 1 recusa(s).'),
    ).toBeInTheDocument();
    expect(state.posted()).toEqual({
      acceptItemIds: [uuid(1)],
      rejectDocuments: [{ documentId: uuid(12), rejectionReason: 'Arquivo ilegível' }],
      reviewExtras: [{ documentId: uuid(14), decision: 'accepted' }],
    });
    expect(screen.queryByText(/decisão\(ões\) não publicada/)).not.toBeInTheDocument();
    await waitFor(() => expect(state.calls()).toBeGreaterThan(before));
  });

  it('abrir um documento usa só a rota do Contador e abre o blob numa aba nova', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createObjectURL = vi.fn(() => 'blob:local/1');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const requested: string[] = [];
    server.use(
      http.get(apiUrl(`/documents/:id/content`), ({ params }) => {
        requested.push(String(params.id));
        return new HttpResponse('pdf', { headers: { 'Content-Type': 'application/pdf' } });
      }),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Abrir arquivo-11.pdf' }));

    await waitFor(() => expect(open).toHaveBeenCalledWith('blob:local/1', '_blank', 'noopener'));
    expect(requested).toEqual([uuid(11)]);
    open.mockRestore();
  });

  it('o diálogo de encerrar avisa quantos extras ainda não foram conferidos', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/documento\(s\) extra\(s\)/)).toHaveTextContent(
      '1 documento(s) extra(s) ainda não conferido(s).',
    );
  });

  it('Solicitação encerrada com extra pendente mostra o aviso e ainda deixa aceitar o extra', async () => {
    const user = userEvent.setup();
    mount('closed');

    expect(
      await screen.findByText(/aguardando conferência\. Eles só entram no zip final/),
    ).toHaveTextContent('1 documento(s) extra(s) aguardando conferência.');
    expect(screen.getByRole('button', { name: 'Aceitar: extra.pdf' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Aceitar: extra.pdf' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 decisão(ões) não publicada(s)');
  });

  it('Descartar zera as decisões', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Aceitar item: Aluguel' }));
    await user.click(
      within(screen.getByRole('status').parentElement!.parentElement!).getByRole('button', {
        name: 'Descartar',
      }),
    );

    expect(screen.queryByText(/decisão\(ões\) não publicada/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar item: Aluguel' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

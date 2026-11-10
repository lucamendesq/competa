import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { contactSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT',
  'Access-Control-Allow-Headers': 'Content-Type, x-amz-checksum-sha256',
};

const pendingRow = (
  companyName: string,
  itemId: string,
  name: string,
  rejections: { fileName: string; rejectionReason: string }[] = [],
) => ({
  requestId: `req-${companyName}`,
  periodId: '00000000-0000-4000-8000-0000000000a1',
  referenceMonth: '2026-10',
  companyId: `co-${companyName}`,
  companyName,
  item: {
    id: itemId,
    name,
    description: null,
    acceptedFormats: ['pdf'],
    status: 'pending',
    dueDate: '2026-11-20',
    rejections,
  },
});

const setup = (
  rows = [
    pendingRow('Mercado Bom Preço', 'i1', 'Extrato bancário'),
    pendingRow('Padaria Pão Quente', 'i2', 'Aluguel', [
      { fileName: 'aluguel.pdf', rejectionReason: 'Comprovante ilegível.' },
    ]),
  ],
) => {
  const state = { rows, presigns: [] as unknown[] };
  server.use(
    http.get(apiUrl('/auth/me'), () => new HttpResponse(null, { status: 401 })),
    http.get(apiUrl('/my/profile'), () => HttpResponse.json(envelope(contactSession()))),
    http.patch(apiUrl('/auth/device'), () => HttpResponse.json(envelope({ ok: true }))),
    http.get(apiUrl('/my/pending'), () => HttpResponse.json(envelope(state.rows))),
    http.post(apiUrl('/my/documents'), async ({ request }) => {
      const body = (await request.json()) as { files: { fileName: string }[] };
      state.presigns.push(body);
      return HttpResponse.json(
        envelope({
          files: body.files.map((file, index) => ({
            fileName: file.fileName,
            accepted: true,
            documentId: `doc-${index}`,
            uploadUrl: `https://storage.local/doc-${index}`,
          })),
        }),
      );
    }),
    http.options(
      'https://storage.local/:doc',
      () => new HttpResponse(null, { status: 204, headers: CORS }),
    ),
    http.put(
      'https://storage.local/:doc',
      () => new HttpResponse(null, { status: 200, headers: CORS }),
    ),
    http.post(apiUrl('/my/documents/confirm'), () => {
      state.rows = state.rows.filter((row) => row.item.id !== 'i1');
      return HttpResponse.json(envelope({ refused: [] }));
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/minha-area/pendencias'] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return state;
};

describe('ContactPendingPage', () => {
  it('agrupa os itens por Empresa e Competência e mostra o motivo da recusa', async () => {
    setup();

    expect(await screen.findByRole('heading', { name: /Mercado Bom Preço/ })).toHaveTextContent(
      'Competência Outubro/2026',
    );
    expect(screen.getByRole('heading', { name: /Padaria Pão Quente/ })).toBeInTheDocument();
    expect(screen.getByText('Comprovante ilegível.')).toBeInTheDocument();
  });

  it('enviar confirma, avisa e o item some do grupo', async () => {
    const state = setup();
    const user = userEvent.setup();
    await screen.findByText('Extrato bancário');

    await user.upload(
      screen.getByLabelText('Arquivos para Extrato bancário'),
      new File(['%PDF'], 'extrato.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByText('Arquivo enviado com sucesso.')).toBeInTheDocument();
    expect(state.presigns[0]).toMatchObject({
      requestId: 'req-Mercado Bom Preço',
      requestItemId: 'i1',
    });
    await waitFor(() => expect(screen.queryByText('Extrato bancário')).not.toBeInTheDocument());
    const padaria = screen.getByRole('heading', { name: /Padaria/ }).parentElement!;
    expect(within(padaria).getByText('Aluguel')).toBeInTheDocument();
  });

  it('sem pendências mostra "Tudo certo por aqui!"', async () => {
    setup([]);

    expect(await screen.findByText('Tudo certo por aqui!')).toBeInTheDocument();
  });
});

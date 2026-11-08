import { render, screen, waitFor } from '@testing-library/react';
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

const PERIOD_ID = '00000000-0000-4000-8000-0000000000a1';
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1';
const DOC_ID = '00000000-0000-4000-8000-0000000000d1';

const setup = () => {
  const state = { detailCalls: [] as string[] };
  server.use(
    http.get(apiUrl('/auth/me'), () => new HttpResponse(null, { status: 401 })),
    http.get(apiUrl('/my/profile'), () => HttpResponse.json(envelope(contactSession()))),
    http.get(apiUrl('/my/periods'), () =>
      HttpResponse.json({
        data: [
          {
            requestId: 'r1',
            requestStatus: 'open',
            periodId: PERIOD_ID,
            referenceMonth: '2026-10',
            periodStatus: 'open',
            dueDate: '2026-11-20',
            companyId: COMPANY_ID,
            companyName: 'Mercado Bom Preço',
            itemCount: 3,
            pendingCount: 1,
            deliveredCount: 2,
          },
        ],
        meta: { page: 1, perPage: 12, total: 1 },
      }),
    ),
    http.get(apiUrl(`/my/periods/${PERIOD_ID}`), ({ request }) => {
      state.detailCalls.push(new URL(request.url).searchParams.get('companyId') ?? '');
      return HttpResponse.json(
        envelope({
          requestId: 'r1',
          requestStatus: 'open',
          periodId: PERIOD_ID,
          referenceMonth: '2026-10',
          periodStatus: 'open',
          dueDate: '2026-11-20',
          companyId: COMPANY_ID,
          companyName: 'Mercado Bom Preço',
          items: [
            {
              id: 'i1',
              name: 'Extrato bancário',
              status: 'submitted',
              dueDate: '2026-11-20',
              documents: [
                {
                  id: DOC_ID,
                  requestItemId: 'i1',
                  fileName: 'extrato-outubro.pdf',
                  sizeBytes: 2048,
                  uploadedAt: '2026-11-05T12:00:00.000Z',
                  reviewStatus: 'pending',
                  rejectionReason: null,
                  uploadedByName: 'Carla Souza',
                },
              ],
            },
          ],
          extraDocuments: [],
        }),
      );
    }),
    http.get(
      apiUrl(`/my/documents/${DOC_ID}/content`),
      () => new HttpResponse('', { headers: { 'Content-Type': 'application/pdf' } }),
    ),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/minha-area/competencias'] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router };
};

describe('ContactHistoryPage', () => {
  it('expandir busca o detalhe uma vez, grava ?periodo= e reaproveita ao recolher e reabrir', async () => {
    const { state, router } = setup();
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', { name: /Outubro\/2026/ });
    expect(screen.getByText(/2 de 3 itens aprovados · 2 arquivos enviados/)).toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByText('extrato-outubro.pdf')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('periodo')).toBe(
      `${PERIOD_ID}:${COMPANY_ID}`,
    );

    await user.click(toggle);
    await waitFor(() => expect(screen.queryByText('extrato-outubro.pdf')).not.toBeInTheDocument());
    await user.click(toggle);
    expect(await screen.findByText('extrato-outubro.pdf')).toBeInTheDocument();

    expect(state.detailCalls).toEqual([COMPANY_ID]);
  });

  it('baixar com blob vazio mostra "Nenhum documento para baixar."', async () => {
    setup();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Outubro\/2026/ }));
    await user.click(await screen.findByRole('button', { name: 'Baixar extrato-outubro.pdf' }));

    expect(await screen.findByText('Nenhum documento para baixar.')).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { panelRow } from '@/testing/factories/panel-row';
import { period } from '@/testing/factories/period';
import { request } from '@/testing/factories/request';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PERIOD_ID = uuid(1);
const REQUEST_ID = uuid(2);
const ITEM_ID = uuid(3);
const DOC_ID = uuid(4);
const signInUrl = 'http://api.test/api/auth/sign-in/email';

const setup = () => {
  const state = {
    signedIn: false,
    opened: false,
    reviewed: false,
    periodListCalls: 0,
    panelCalls: 0,
    review: undefined as unknown,
  };

  const openedPeriod = () => ({
    ...period({ id: PERIOD_ID, referenceMonth: '2026-10-01' }),
    completeRequestCount: 0,
    pendingItemCount: 1,
    deliveredCount: 1,
  });

  server.use(
    http.get(apiUrl('/auth/me'), () =>
      state.signedIn
        ? HttpResponse.json(envelope(accountantSession()))
        : new HttpResponse(null, { status: 401 }),
    ),
    http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
    http.post(signInUrl, () => {
      state.signedIn = true;
      return HttpResponse.json({ token: 't', user: { id: 'u1' } });
    }),
    http.get(apiUrl('/periods'), () => {
      state.periodListCalls += 1;
      const data = state.opened ? [period({ id: PERIOD_ID, referenceMonth: '2026-10-01' })] : [];
      return HttpResponse.json({ data, meta: { page: 1, perPage: 20, total: data.length } });
    }),
    http.get(apiUrl('/periods/preview'), () =>
      HttpResponse.json(
        envelope({
          existingPeriodId: null,
          requests: [
            {
              companyId: uuid(10),
              companyName: 'Mercado Bom Preço',
              contactName: 'Carla',
              itemCount: 1,
            },
          ],
          skipped: [],
          notes: [],
        }),
      ),
    ),
    http.post(apiUrl('/periods'), () => {
      state.opened = true;
      return HttpResponse.json(
        envelope({
          id: PERIOD_ID,
          referenceMonth: '2026-10-01',
          status: 'open',
          dueDate: null,
          warnings: [],
          requests: [
            {
              id: REQUEST_ID,
              companyId: uuid(10),
              companyName: 'Mercado Bom Preço',
              itemCount: 1,
              uploadUrl: 'http://x/envio/t',
            },
          ],
        }),
      );
    }),
    http.get(apiUrl(`/periods/${PERIOD_ID}`), () => HttpResponse.json(envelope(openedPeriod()))),
    http.get(apiUrl(`/periods/${PERIOD_ID}/pending-panel`), () => {
      state.panelCalls += 1;
      return HttpResponse.json(
        envelope([
          panelRow({
            companyId: uuid(10),
            companyName: 'Mercado Bom Preço',
            requestId: REQUEST_ID,
            counts: state.reviewed
              ? { pending: 0, submitted: 0, accepted: 1, rejected: 0 }
              : { pending: 0, submitted: 1, accepted: 0, rejected: 0 },
            missing: [],
          }),
        ]),
      );
    }),
    http.get(apiUrl('/companies'), () =>
      HttpResponse.json({ data: [], meta: { page: 1, perPage: 100, total: 0 } }),
    ),
    http.post(apiUrl(`/requests/${REQUEST_ID}/upload-link`), () =>
      HttpResponse.json(
        envelope({
          uploadUrl: 'http://localhost/envio/novo',
          contactEmail: 'carla@mercado.com.br',
        }),
      ),
    ),
    http.get(apiUrl(`/requests/${REQUEST_ID}`), () =>
      HttpResponse.json(
        envelope(
          request({
            id: REQUEST_ID,
            periodId: PERIOD_ID,
            companyName: 'Mercado Bom Preço',
            items: [
              {
                id: ITEM_ID,
                name: 'Extrato bancário',
                description: null,
                status: state.reviewed ? 'accepted' : 'submitted',
                dueDate: null,
                acceptedFormats: ['pdf'],
                documents: [
                  {
                    id: DOC_ID,
                    requestItemId: ITEM_ID,
                    fileName: 'extrato.pdf',
                    sizeBytes: 2048,
                    uploadedAt: '2026-11-07T10:00:00.000Z',
                    reviewStatus: state.reviewed ? 'accepted' : 'pending',
                    rejectionReason: null,
                    uploadedByContactId: null,
                  },
                ],
              },
            ],
            extraDocuments: [],
          }),
        ),
      ),
    ),
    http.post(apiUrl(`/requests/${REQUEST_ID}/review`), async ({ request: req }) => {
      state.review = await req.json();
      state.reviewed = true;
      return HttpResponse.json(
        envelope({
          requestId: REQUEST_ID,
          requestStatus: 'complete',
          completed: true,
          acceptedItems: 1,
          rejectedDocuments: 0,
          linkRotated: false,
          emailSent: false,
        }),
      );
    }),
  );
  return state;
};

describe('fluxo do Contador', () => {
  it('entra, abre a competência, copia o link, revisa e o painel volta atualizado', async () => {
    const state = setup();
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: ['/entrar'] });
    render(
      <AppProviders queryClient={makeQueryClient()}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    await user.type(await screen.findByLabelText(/E-mail/), 'dono@exemplo.com.br');
    await user.type(screen.getByLabelText(/Senha/), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Nenhuma competência aberta')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Abrir competência/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Abrir nova competência' });
    await user.click(within(dialog).getByRole('button', { name: 'Revisar envios' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar e enviar 1 e-mails' }));
    expect(await within(dialog).findByText('Competência aberta com sucesso')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(state.periodListCalls).toBeGreaterThan(1));

    await user.click(await screen.findByRole('link', { name: 'Outubro/2026' }));
    const row = (await screen.findByText('Mercado Bom Preço')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Copiar link' }));
    expect(
      await screen.findByText(
        'Novo link de Mercado Bom Preço copiado. O link anterior continua valendo por até 48 h.',
      ),
    ).toBeInTheDocument();

    await user.click(within(row).getByRole('link', { name: 'Conferir (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Aceitar item: Extrato bancário' }));
    await user.click(screen.getByRole('button', { name: 'Publicar revisão' }));
    expect(await screen.findByText(/Revisão publicada/)).toBeInTheDocument();
    expect(state.review).toMatchObject({ acceptItemIds: [ITEM_ID] });
    const panelCallsBefore = state.panelCalls;

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    const updated = (await screen.findByText('Mercado Bom Preço')).closest('li')!;
    expect(await within(updated).findByRole('link', { name: 'Envios' })).toBeInTheDocument();
    expect(state.panelCalls).toBeGreaterThan(panelCallsBefore);
  });
});

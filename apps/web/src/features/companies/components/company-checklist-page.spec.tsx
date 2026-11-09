import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { company } from '@/testing/factories/company';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const COMPANY_ID = '00000000-0000-4000-8000-000000000c01';

const line = (
  documentTypeId: string,
  name: string,
  source: 'template' | 'override' = 'template',
) => ({
  documentTypeId,
  name,
  category: 'fiscal',
  description: null,
  acceptedFormats: ['pdf'],
  periodicity: 'monthly',
  annualMonth: null,
  dueDay: 10,
  dueMonthOffset: 1,
  conditionFlag: null,
  required: true,
  source,
  applies: true,
});

const setup = () => {
  const state = { added: false, calls: { checklist: 0, overrides: 0 }, saved: [] as unknown[] };
  server.use(
    http.get(apiUrl(`/companies/${COMPANY_ID}`), () =>
      HttpResponse.json(
        envelope({ ...company({ id: COMPANY_ID, name: 'Oficina Roda Viva' }), contacts: [] }),
      ),
    ),
    http.get(apiUrl(`/companies/${COMPANY_ID}/checklist`), () => {
      state.calls.checklist += 1;
      return HttpResponse.json(
        envelope({
          companyId: COMPANY_ID,
          template: { id: 't1', name: 'Template Simples Nacional' },
          flags: {},
          items: [
            line('d1', 'Guia DAS'),
            ...(state.added ? [line('d2', 'Cartão CNPJ', 'override')] : []),
          ],
        }),
      );
    }),
    http.get(apiUrl(`/companies/${COMPANY_ID}/checklist-overrides`), () => {
      state.calls.overrides += 1;
      return HttpResponse.json(envelope([]));
    }),
    http.get(apiUrl('/document-types'), () =>
      HttpResponse.json({
        data: [
          {
            id: 'd1',
            name: 'Guia DAS',
            category: 'fiscal',
            acceptedFormats: ['pdf'],
            description: null,
            isProduct: true,
          },
          {
            id: 'd2',
            name: 'Cartão CNPJ',
            category: 'corporate',
            acceptedFormats: ['pdf'],
            description: null,
            isProduct: true,
          },
        ],
        meta: { page: 1, perPage: 100, total: 2 },
      }),
    ),
    http.put(apiUrl(`/companies/${COMPANY_ID}/checklist-overrides`), async ({ request }) => {
      state.saved.push(await request.json());
      state.added = true;
      return HttpResponse.json(envelope({ id: 'o1' }));
    }),
  );
  const router = createMemoryRouter(routes, {
    initialEntries: [`/empresas/${COMPANY_ID}/checklist`],
  });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return state;
};

describe('CompanyChecklistPage', () => {
  it('adicionar pelo catálogo salva o override, refaz checklist e overrides e marca a linha como adicionada', async () => {
    const state = setup();
    const user = userEvent.setup();
    expect(
      await screen.findByRole('heading', { name: 'Checklist de Oficina Roda Viva', level: 1 }),
    ).toBeInTheDocument();
    const before = { ...state.calls };

    await user.click(screen.getByRole('button', { name: 'Adicionar documento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar documento do catálogo' });
    expect(within(dialog).queryByText('Guia DAS')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar Cartão CNPJ' }));

    expect(await screen.findByText('Cartão CNPJ adicionado ao checklist.')).toBeInTheDocument();
    expect(state.saved[0]).toEqual({
      documentTypeId: 'd2',
      action: 'add',
      periodicity: 'monthly',
      dueMonthOffset: 1,
      required: true,
    });
    await waitFor(() => expect(state.calls.checklist).toBeGreaterThan(before.checklist));
    expect(state.calls.overrides).toBeGreaterThan(before.overrides);
    const row = (await screen.findByText('Cartão CNPJ', { selector: 'p' })).closest('li')!;
    expect(within(row).getByText('Adicionado')).toBeInTheDocument();
  });

  it('a busca do catálogo filtra pelo nome', async () => {
    setup();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Checklist de Oficina Roda Viva', level: 1 });

    await user.click(screen.getByRole('button', { name: 'Adicionar documento' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Buscar documento no catálogo'), 'xyz');

    expect(
      within(dialog).getByText('Nenhum documento do catálogo fora deste checklist.'),
    ).toBeInTheDocument();
  });

  it('desligar um item do template cria o override de remoção', async () => {
    const state = setup();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: 'Remover Guia DAS' }));

    expect(
      await screen.findByText('Guia DAS saiu do checklist desta empresa.'),
    ).toBeInTheDocument();
    expect(state.saved[0]).toMatchObject({ documentTypeId: 'd1', action: 'remove' });
  });
});

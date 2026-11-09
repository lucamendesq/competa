import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { catalogKeys } from '@/features/catalog';
import { makeQueryClient } from '@/shared/lib/query-client';
import { template } from '@/testing/factories/template';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000a01';
const OWN_ID = '00000000-0000-4000-8000-000000000a02';
const COPY_ID = '00000000-0000-4000-8000-000000000a03';
const ITEM_ID = '00000000-0000-4000-8000-000000000b01';

const detail = (id: string, accountingFirmId: string | null) => ({
  id,
  name: accountingFirmId ? 'Meu template' : 'Simples Nacional',
  derivedFrom: null,
  accountingFirmId,
  items: [
    {
      id: ITEM_ID,
      documentTypeId: '00000000-0000-4000-8000-000000000d01',
      name: 'Guia DAS',
      category: 'taxes',
      description: null,
      acceptedFormats: ['pdf'],
      periodicity: 'monthly',
      annualMonth: null,
      dueDay: 20,
      dueMonthOffset: 1,
      conditionFlag: null,
      required: true,
    },
  ],
});

const setup = (path: string) => {
  const state = { patches: [] as unknown[], renames: [] as unknown[], derived: [] as unknown[] };
  server.use(
    http.get(apiUrl('/checklist-templates'), () =>
      HttpResponse.json(
        envelope([
          template({ id: PRODUCT_ID, name: 'Simples Nacional', isProduct: true, itemCount: 1 }),
          template({ id: OWN_ID, name: 'Meu template', isProduct: false, companyCount: 2 }),
        ]),
      ),
    ),
    http.get(apiUrl(`/checklist-templates/${PRODUCT_ID}`), () =>
      HttpResponse.json(envelope(detail(PRODUCT_ID, null))),
    ),
    http.get(apiUrl(`/checklist-templates/${OWN_ID}`), () =>
      HttpResponse.json(envelope(detail(OWN_ID, '00000000-0000-4000-8000-000000000f01'))),
    ),
    http.get(apiUrl(`/checklist-templates/${COPY_ID}`), () =>
      HttpResponse.json(envelope({ ...detail(COPY_ID, 'f'), name: 'Simples Nacional (Cópia)' })),
    ),
    http.get(apiUrl('/document-types'), () =>
      HttpResponse.json({ data: [], meta: { page: 1, perPage: 100, total: 0 } }),
    ),
    http.post(apiUrl(`/checklist-templates/${PRODUCT_ID}/derive`), async ({ request }) => {
      state.derived.push(await request.json());
      return HttpResponse.json(envelope(template({ id: COPY_ID })));
    }),
    http.patch(apiUrl(`/checklist-templates/${OWN_ID}`), async ({ request }) => {
      state.renames.push(await request.json());
      return HttpResponse.json(envelope(detail(OWN_ID, 'f')));
    }),
    http.patch(apiUrl(`/checklist-templates/${OWN_ID}/items/${ITEM_ID}`), async ({ request }) => {
      state.patches.push(await request.json());
      return HttpResponse.json(envelope(detail(OWN_ID, 'f').items[0]));
    }),
  );
  const queryClient = makeQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router, invalidate };
};

describe('templates', () => {
  it('duplicar pela lista navega para o novo template e invalida a lista', async () => {
    const { state, router, invalidate } = setup('/templates');
    const user = userEvent.setup();
    expect(await screen.findByText('Padrão Competa')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Duplicar' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Duplicar template' });
    expect(within(dialog).getByLabelText('Nome do novo template')).toHaveValue(
      'Simples Nacional (Cópia)',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Criar cópia' }));

    expect(await screen.findByText('Template copiado com sucesso.')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/templates/${COPY_ID}`));
    expect(state.derived).toEqual([{ name: 'Simples Nacional (Cópia)' }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: catalogKeys.templates() });
  });

  it('template do produto é somente leitura e oferece duplicar', async () => {
    setup(`/templates/${PRODUCT_ID}`);

    expect(await screen.findByLabelText('Nome do template')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicar para editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover Guia DAS' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Frequência')).toBeDisabled();
  });

  it('salvar com nome vazio mostra o erro no campo e não diz "Template salvo."', async () => {
    const { state } = setup(`/templates/${OWN_ID}`);
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText('Nome do template'));
    await user.click(screen.getByRole('button', { name: 'Salvar template' }));

    expect(screen.getByText('Informe o nome do template.', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do template')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Template salvo.')).not.toBeInTheDocument();
    expect(state.renames).toEqual([]);
  });

  it('salvar envia o item alterado e diz "Template salvo."', async () => {
    const { state } = setup(`/templates/${OWN_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Obrigatório'));
    expect(screen.getByText('Modificado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar template' }));

    expect(await screen.findByText('Template salvo.')).toBeInTheDocument();
    expect(state.patches).toEqual([
      {
        periodicity: 'monthly',
        annualMonth: null,
        dueDay: 20,
        dueMonthOffset: 1,
        conditionFlag: null,
        required: false,
      },
    ]);
    await waitFor(() =>
      expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument(),
    );
  });

  it('com alteração pendente, sair para /templates pede confirmação e "Ficar" mantém a rota', async () => {
    const { router } = setup(`/templates/${OWN_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Obrigatório'));
    await act(() => router.navigate('/templates'));

    const dialog = await screen.findByRole('dialog', { name: 'Sair sem salvar?' });
    await user.click(within(dialog).getByRole('button', { name: 'Ficar' }));

    expect(router.state.location.pathname).toBe(`/templates/${OWN_ID}`);
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();

    await act(() => router.navigate('/templates'));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Sair sem salvar?' })).getByRole('button', {
        name: 'Sair e descartar',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/templates'));
  });
});

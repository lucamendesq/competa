import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { useInvitedCompaniesStore } from '@/features/companies/store/invited-companies.store';
import { makeQueryClient } from '@/shared/lib/query-client';
import { company } from '@/testing/factories/company';
import { template } from '@/testing/factories/template';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const TEMPLATE_ID = '00000000-0000-4000-8000-000000000a01';
const withLink = company({
  id: '00000000-0000-4000-8000-000000000c01',
  name: 'Oficina Roda Viva',
  contactCount: 1,
  contacts: [{ id: '00000000-0000-4000-8000-000000000d01', name: 'Rita', email: 'rita@x.com' }],
});
const withoutContact = company({ id: '00000000-0000-4000-8000-000000000c02', name: 'Padaria' });

const usage = (overCap = false) => ({
  planName: 'essencial',
  companiesActive: 2,
  companiesInactive: 1,
  companyCap: overCap ? 1 : 30,
  softCap: 36,
  overCap,
  recommendedPlan: 'profissional',
});

const setup = ({ rows = [withLink, withoutContact], overCap = false } = {}) => {
  const state = { searches: [] as string[], applied: [] as unknown[], invites: 0 };
  server.use(
    http.get(apiUrl('/companies'), ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? '';
      state.searches.push(search);
      const data = search ? rows.filter((row) => row.name.toLowerCase().includes(search)) : rows;
      return HttpResponse.json({ data, meta: { page: 1, perPage: 20, total: data.length } });
    }),
    http.get(apiUrl('/companies/usage'), () => HttpResponse.json(envelope(usage(overCap)))),
    http.get(apiUrl('/checklist-templates'), () =>
      HttpResponse.json(envelope([template({ id: TEMPLATE_ID, name: 'Simples com folha' })])),
    ),
    http.post(apiUrl('/companies/access-invites'), () => {
      state.invites += 1;
      return HttpResponse.json(
        envelope({
          invited: 1,
          skipped: 0,
          results: [{ companyId: withLink.id, status: 'invited' }],
        }),
      );
    }),
    http.post(apiUrl('/companies/apply-template'), async ({ request }) => {
      state.applied.push(await request.json());
      return HttpResponse.json(envelope({ updated: 2 }));
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/empresas'] });
  const view = render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router, view };
};

beforeEach(() => {
  sessionStorage.clear();
  useInvitedCompaniesStore.setState({ invitedIds: [] });
});

describe('CompaniesListPage', () => {
  it('a busca escreve ?busca= depois do debounce e faz uma única query', async () => {
    const { state, router } = setup();
    const user = userEvent.setup();
    await screen.findByText('Oficina Roda Viva');

    await user.type(screen.getByLabelText('Buscar empresa'), 'pad');

    await waitFor(() => expect(router.state.location.search).toBe('?busca=pad'));
    await waitFor(() => expect(screen.queryByText('Oficina Roda Viva')).not.toBeInTheDocument());
    expect(screen.getByText('Padaria')).toBeInTheDocument();
    expect(state.searches.filter(Boolean)).toEqual(['pad']);
  });

  it('as abas escrevem ?ativas= e mostram as contagens do plano', async () => {
    const { router } = setup();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Inativas\s*1/ }));

    expect(router.state.location.search).toBe('?ativas=false');
    expect(screen.getByRole('button', { name: /Inativas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Todas\s*3/ })).toBeInTheDocument();
  });

  it('convidar para o app marca a Empresa e a marca sobrevive a um remount', async () => {
    const { state, view } = setup();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Convidar para o app' }));

    expect(await screen.findByText('Convite enviado por e-mail.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convite enviado' })).toBeDisabled();
    expect(state.invites).toBe(1);

    view.unmount();
    setup();
    expect(await screen.findByRole('button', { name: 'Convite enviado' })).toBeDisabled();
  });

  it('aplicar template em lote envia as selecionadas, mostra o toast com updated e limpa a seleção', async () => {
    const { state } = setup();
    const user = userEvent.setup();
    await screen.findByText('Oficina Roda Viva');

    await user.click(screen.getByLabelText('Selecionar todas'));
    const bar = screen.getByRole('region', { name: 'Ações em lote nas empresas selecionadas' });
    expect(within(bar).getByText('empresas selecionadas')).toBeInTheDocument();
    await within(bar).findByRole('option', { name: 'Simples com folha' });
    await user.selectOptions(within(bar).getByLabelText('Template de checklist'), TEMPLATE_ID);
    await user.click(within(bar).getByRole('button', { name: 'Aplicar a 2 empresas' }));

    expect(await screen.findByText('Template aplicado a 2 empresa(s).')).toBeInTheDocument();
    expect(state.applied[0]).toEqual({
      companyIds: [withLink.id, withoutContact.id],
      checklistTemplateId: TEMPLATE_ID,
    });
    expect(screen.queryByRole('region', { name: /Ações em lote/ })).not.toBeInTheDocument();
  });

  it('desativar pede confirmação', async () => {
    let deleted = '';
    setup();
    server.use(
      http.delete(apiUrl('/companies/:id'), ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json(envelope({ ...withLink, active: false }));
      }),
    );
    const user = userEvent.setup();
    await screen.findByText('Oficina Roda Viva');

    await user.click(screen.getAllByRole('button', { name: 'Desativar' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Desativar empresa?' });
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText('Empresa desativada.')).toBeInTheDocument();
    expect(deleted).toBe(withLink.id);
  });

  it('sem empresas mostra o vazio com ação e o banner de teto quando passa do plano', async () => {
    setup({ rows: [], overCap: true });

    expect(await screen.findByText('Nenhuma empresa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova empresa' })).toBeInTheDocument();
    expect(await screen.findByText('Você passou do teto do seu plano')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o Profissional' })).toHaveAttribute(
      'href',
      '/configuracoes/plano?plano=profissional',
    );
  });
});

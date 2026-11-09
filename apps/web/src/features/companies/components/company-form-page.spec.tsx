import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { company } from '@/testing/factories/company';
import { template } from '@/testing/factories/template';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const COMPANY_ID = '00000000-0000-4000-8000-000000000c01';
const CONTACT_ID = '00000000-0000-4000-8000-000000000d01';
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000a01';
const ACCOUNTANT_ID = '00000000-0000-4000-8000-000000000e01';

const templateItem = (id: string, name: string, conditionFlag: string | null = null) => ({
  id,
  name,
  category: 'fiscal',
  periodicity: 'monthly',
  conditionFlag,
});

const detail = {
  ...company({
    id: COMPANY_ID,
    name: 'Oficina Roda Viva',
    cnpj: '11222333000181',
    checklistTemplateId: '00000000-0000-4000-8000-000000000a01',
  }),
  contacts: [
    { id: CONTACT_ID, name: 'Rita Lima', email: 'rita@roda.com.br', phone: '11988887777' },
  ],
};

const setup = (path: string) => {
  const state = {
    created: [] as unknown[],
    updated: [] as unknown[],
    contactPatches: [] as unknown[],
    revoked: 0,
  };
  server.use(
    http.get(apiUrl('/checklist-templates'), () =>
      HttpResponse.json(envelope([template({ id: TEMPLATE_ID, name: 'Simples com folha' })])),
    ),
    http.get(apiUrl(`/checklist-templates/${TEMPLATE_ID}`), () =>
      HttpResponse.json(
        envelope({
          id: TEMPLATE_ID,
          name: 'Simples com folha',
          items: [
            templateItem('i1', 'Guia DAS'),
            templateItem('i2', 'Folha de pagamento', 'has_employees'),
          ],
        }),
      ),
    ),
    http.get(apiUrl('/accountants'), () =>
      HttpResponse.json(envelope([{ id: ACCOUNTANT_ID, name: 'Ana Contadora' }])),
    ),
    http.get(apiUrl(`/companies/${COMPANY_ID}`), () => HttpResponse.json(envelope(detail))),
    http.get(apiUrl(`/companies/${COMPANY_ID}/contacts/access`), () =>
      HttpResponse.json(
        envelope(state.revoked ? [] : [{ ...detail.contacts[0], hasAccess: true }]),
      ),
    ),
    http.post(apiUrl('/companies'), async ({ request }) => {
      state.created.push(await request.json());
      return HttpResponse.json(envelope({ ...detail, id: COMPANY_ID }), { status: 201 });
    }),
    http.patch(apiUrl(`/companies/${COMPANY_ID}`), async ({ request }) => {
      state.updated.push(await request.json());
      return HttpResponse.json(envelope(detail));
    }),
    http.patch(apiUrl(`/companies/${COMPANY_ID}/contacts/${CONTACT_ID}`), async ({ request }) => {
      state.contactPatches.push(await request.json());
      return HttpResponse.json(envelope({ ...detail.contacts[0], undeliveredLinks: 2 }));
    }),
    http.delete(apiUrl(`/companies/${COMPANY_ID}/contacts/${CONTACT_ID}/access`), () => {
      state.revoked += 1;
      return HttpResponse.json(envelope({ revoked: true }));
    }),
    http.get(apiUrl('/companies'), () =>
      HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0 } }),
    ),
    http.get(apiUrl(`/companies/${COMPANY_ID}/checklist`), () =>
      HttpResponse.json(
        envelope({
          companyId: COMPANY_ID,
          template: null,
          flags: {},
          items: [],
        }),
      ),
    ),
    http.get(apiUrl(`/companies/${COMPANY_ID}/checklist-overrides`), () =>
      HttpResponse.json(envelope([])),
    ),
    http.get(apiUrl('/document-types'), () =>
      HttpResponse.json({ data: [], meta: { page: 1, perPage: 100, total: 0 } }),
    ),
    http.get(apiUrl('/companies/usage'), () =>
      HttpResponse.json(
        envelope({
          planName: 'trial',
          companiesActive: 1,
          companiesInactive: 0,
          companyCap: 10,
          softCap: 10,
          overCap: false,
          recommendedPlan: 'essencial',
        }),
      ),
    ),
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router };
};

describe('CompanyFormPage', () => {
  it('cadastra com template, mascara o CNPJ e leva ao checklist com created=1', async () => {
    const { state, router } = setup('/empresas/nova');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Nova empresa', level: 1 });

    await user.type(screen.getByLabelText(/Nome da empresa/), 'Padaria Pão Quente');
    await user.type(screen.getByLabelText('CNPJ (Opcional)'), '11222333000181');
    expect(screen.getByLabelText('CNPJ (Opcional)')).toHaveValue('11.222.333/0001-81');
    await user.click(screen.getByLabelText('Tem funcionários'));
    await screen.findByRole('option', { name: 'Simples com folha' });
    await user.selectOptions(screen.getByLabelText('Checklist aplicado'), TEMPLATE_ID);

    expect(await screen.findByText('2 itens')).toBeInTheDocument();
    expect(screen.getByText('Folha de pagamento')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar empresa' }));

    expect(await screen.findByText('Empresa cadastrada.')).toBeInTheDocument();
    expect(state.created[0]).toEqual({
      name: 'Padaria Pão Quente',
      flags: { has_employees: true, accepts_card_payments: false, has_inventory: false },
      checklistTemplateId: TEMPLATE_ID,
      cnpj: '11.222.333/0001-81',
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/empresas/${COMPANY_ID}/checklist`),
    );
    expect(router.state.location.search).toBe('?created=1');
  });

  it('nome do contato sem e-mail avisa e bloqueia o envio', async () => {
    setup('/empresas/nova');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Nova empresa', level: 1 });

    await user.type(screen.getByLabelText(/Nome da empresa/), 'Padaria');
    await user.type(screen.getByLabelText('Nome do contato'), 'João');

    expect(
      screen.getByText('Sem e-mail o Responsável não recebe o link de cobrança.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar empresa' })).toBeDisabled();
  });

  it('edita: carrega os valores, salva com null nos vazios e avisa links não entregues', async () => {
    const { state, router } = setup(`/empresas/${COMPANY_ID}/editar`);
    const user = userEvent.setup();

    expect(await screen.findByLabelText(/Nome da empresa/)).toHaveValue('Oficina Roda Viva');
    expect(screen.getByLabelText('CNPJ (Opcional)')).toHaveValue('11.222.333/0001-81');
    expect(screen.getByLabelText('WhatsApp (Opcional)')).toHaveValue('(11) 98888-7777');
    await screen.findByRole('option', { name: 'Simples com folha' });
    expect(screen.getByLabelText('Checklist aplicado')).toHaveValue(TEMPLATE_ID);

    await user.clear(screen.getByLabelText('CNPJ (Opcional)'));
    await user.click(screen.getByRole('button', { name: 'Salvar empresa' }));

    expect(await screen.findByText('Empresa atualizada.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'O novo Responsável não recebeu 2 link(s) de envio. Reenvie pela Solicitação.',
      ),
    ).toBeInTheDocument();
    expect(state.updated[0]).toEqual({
      name: 'Oficina Roda Viva',
      checklistTemplateId: TEMPLATE_ID,
      responsibleAccountantId: null,
      cnpj: null,
      flags: { has_employees: false, accepts_card_payments: false, has_inventory: false },
    });
    expect(state.contactPatches[0]).toEqual({
      name: 'Rita Lima',
      email: 'rita@roda.com.br',
      phone: '(11) 98888-7777',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/empresas'));
  });

  it('revogar acesso confirma no diálogo e some da lista', async () => {
    const { state } = setup(`/empresas/${COMPANY_ID}/editar`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Revogar acesso' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revogar acesso?' });
    await user.click(within(dialog).getByRole('button', { name: 'Revogar acesso' }));

    expect(await screen.findByText('Acesso de Rita Lima revogado.')).toBeInTheDocument();
    expect(state.revoked).toBe(1);
    await waitFor(() => expect(screen.queryByText('Acesso ao app')).not.toBeInTheDocument());
  });

  it('empresa inexistente mostra o estado de não encontrada', async () => {
    setup(`/empresas/${COMPANY_ID}/editar`);
    server.use(
      http.get(apiUrl(`/companies/${COMPANY_ID}`), () =>
        HttpResponse.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 }),
      ),
    );

    expect(await screen.findByText('Empresa não encontrada')).toBeInTheDocument();
  });
});

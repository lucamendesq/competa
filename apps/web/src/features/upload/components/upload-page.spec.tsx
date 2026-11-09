import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const TOKEN = 'tok-publico-123';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT',
  'Access-Control-Allow-Headers': 'Content-Type, x-amz-checksum-sha256',
};
const ITEM_ID = '00000000-0000-4000-8000-000000000b01';

const checklistBody = (overrides: Record<string, unknown> = {}) => ({
  company: 'Mercado Bom Preço',
  accountingFirm: 'Contabilidade Exemplo',
  accountingFirmLogoUrl: null,
  hasAccess: false,
  referenceMonth: '2026-10',
  dueDate: '2026-11-20',
  status: 'open',
  items: [
    {
      id: ITEM_ID,
      name: 'Extrato bancário',
      description: null,
      acceptedFormats: ['pdf'],
      dueDate: '2026-11-20',
      status: 'pending',
      documents: [],
    },
    {
      id: '00000000-0000-4000-8000-000000000b02',
      name: 'Aluguel',
      description: null,
      acceptedFormats: ['pdf'],
      dueDate: '2026-11-20',
      status: 'pending',
      documents: [{ reviewStatus: 'rejected', rejectionReason: 'Comprovante ilegível.' }],
    },
  ],
  extraDocuments: [],
  ...overrides,
});

const setup = ({
  checklist = checklistBody(),
  checklistStatus = 200,
  putStatus = 200,
  refused = [] as { documentId: string; fileName: string; reason: string }[],
} = {}) => {
  const state = { served: [] as string[], meCalls: 0 };
  server.use(
    http.get(apiUrl(`/upload/${TOKEN}`), () => {
      const body = checklistStatus === 200 ? envelope(checklist) : { error: { code: 'X' } };
      state.served.push(JSON.stringify(body));
      return HttpResponse.json(body, { status: checklistStatus });
    }),
    http.get(apiUrl('/auth/me'), () => {
      state.meCalls += 1;
      return new HttpResponse(null, { status: 401 });
    }),
    http.post(apiUrl(`/upload/${TOKEN}/documents`), async ({ request }) => {
      const { files } = (await request.json()) as { files: { fileName: string }[] };
      return HttpResponse.json(
        envelope({
          files: files.map((file, index) => ({
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
      () => new HttpResponse(null, { status: putStatus, headers: CORS }),
    ),
    http.post(apiUrl(`/upload/${TOKEN}/documents/confirm`), () =>
      HttpResponse.json(envelope({ confirmed: 1, submittedItemIds: [], refused })),
    ),
    http.post(apiUrl(`/upload/${TOKEN}/access`), () =>
      HttpResponse.json(
        envelope({ email: 'carla@mercado.com.br', name: 'Carla', nextStep: 'check_email' }),
      ),
    ),
  );
  const router = createMemoryRouter(routes, { initialEntries: [`/envio/${TOKEN}`] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return state;
};

const pickFiles = async (user: ReturnType<typeof userEvent.setup>, files: File[]) => {
  await user.click(await screen.findByRole('button', { name: /Extrato bancário/ }));
  const [input] = screen.getAllByLabelText(/Arraste os arquivos aqui ou toque para escolher/);
  await user.upload(input as HTMLInputElement, files);
};

describe('UploadPage', () => {
  it('o checklist público não traz storageKey, downloadUrl nem nome de arquivo, e a tela abre sem eles', async () => {
    const state = setup();

    expect(await screen.findByRole('heading', { name: 'Mercado Bom Preço' })).toBeInTheDocument();
    expect(state.served[0]).not.toMatch(/storageKey|downloadUrl|fileName|content/);
    expect(screen.getByText('Comprovante ilegível.')).toBeInTheDocument();
    expect(screen.getByText('Arquivo 1')).toBeInTheDocument();
    expect(screen.getByText('0 de 2 itens entregues')).toBeInTheDocument();
  });

  it('arquivo recusado no confirm mostra o motivo, sem "Tentar de novo"', async () => {
    setup({
      refused: [{ documentId: 'doc-0', fileName: 'extrato.pdf', reason: 'Arquivo vazio.' }],
    });
    const user = userEvent.setup();

    await pickFiles(user, [new File(['%PDF'], 'extrato.pdf', { type: 'application/pdf' })]);

    const dialog = await screen.findByRole('dialog', { name: 'Alguns arquivos não foram aceitos' });
    expect(within(dialog).getByText('Arquivo vazio.')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: /Tentar de novo/ }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Entendi' })).toBeInTheDocument();
  });

  it('PUT que falha deixa o arquivo com "Tentar de novo"', async () => {
    setup({ putStatus: 500 });
    const user = userEvent.setup();

    await pickFiles(user, [new File(['%PDF'], 'extrato.pdf', { type: 'application/pdf' })]);

    const dialog = await screen.findByRole('dialog', { name: 'O envio não completou' });
    expect(within(dialog).getByText('extrato.pdf')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tentar de novo (1)' })).toBeInTheDocument();
  });

  it('envio aceito avisa e refaz o checklist', async () => {
    const state = setup();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Mercado Bom Preço' });

    await pickFiles(user, [new File(['%PDF'], 'extrato.pdf', { type: 'application/pdf' })]);

    expect(await screen.findByText('Arquivo enviado com sucesso.')).toBeInTheDocument();
    await waitFor(() => expect(state.served.length).toBeGreaterThan(1));
  });

  it('"Criar meu acesso" manda o link por e-mail e refaz a sessão', async () => {
    const state = setup({
      checklist: checklistBody({
        items: [
          {
            id: ITEM_ID,
            name: 'Extrato bancário',
            description: null,
            acceptedFormats: ['pdf'],
            dueDate: '2026-11-20',
            status: 'submitted',
            documents: [{ reviewStatus: 'pending', rejectionReason: null }],
          },
        ],
      }),
    });
    const user = userEvent.setup();
    expect(await screen.findByText('Tudo enviado!')).toBeInTheDocument();
    const before = state.meCalls;

    await user.click(screen.getByRole('button', { name: 'Criar meu acesso' }));

    expect(await screen.findByText('Link de acesso enviado!')).toBeInTheDocument();
    await waitFor(() => expect(state.meCalls).toBeGreaterThan(before));
  });

  it('link expirado leva a "Receber o link atual"; falha passageira pede para tentar de novo', async () => {
    setup({ checklistStatus: 410 });
    expect(await screen.findByText('Link indisponível ou expirado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Receber o link atual' })).toHaveAttribute(
      'href',
      '/perdi-meu-link',
    );
  });

  it('limite de requisições (429) não diz que o link morreu', async () => {
    setup({ checklistStatus: 429 });

    expect(await screen.findByText('Não foi possível abrir agora')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const TOKEN = 'tok-fluxo';
const ITEM_ID = '00000000-0000-4000-8000-000000000b01';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT',
  'Access-Control-Allow-Headers': 'Content-Type, x-amz-checksum-sha256',
};

const checklist = (submitted: boolean) => ({
  company: 'Mercado Bom Preço',
  accountingFirm: 'Contabilidade Exemplo',
  accountingFirmLogoUrl: null,
  hasAccess: false,
  referenceMonth: '2026-10',
  dueDate: null,
  status: 'open',
  items: [
    {
      id: ITEM_ID,
      name: 'Extrato bancário',
      description: null,
      acceptedFormats: ['pdf'],
      dueDate: null,
      status: submitted ? 'submitted' : 'pending',
      documents: submitted ? [{ reviewStatus: 'pending', rejectionReason: null }] : [],
    },
  ],
  extraDocuments: [],
});

const setup = () => {
  const state = { submitted: false, checklistCalls: 0, push: [] as unknown[], access: 0 };
  server.use(
    http.get(apiUrl('/auth/me'), () => new HttpResponse(null, { status: 401 })),
    http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
    http.get(apiUrl('/push/vapid-key'), () => HttpResponse.json(envelope({ key: 'AQID' }))),
    http.get(apiUrl(`/upload/${TOKEN}`), () => {
      state.checklistCalls += 1;
      return HttpResponse.json(envelope(checklist(state.submitted)));
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
      () => new HttpResponse(null, { status: 200, headers: CORS }),
    ),
    http.post(apiUrl(`/upload/${TOKEN}/documents/confirm`), () => {
      state.submitted = true;
      return HttpResponse.json(
        envelope({
          confirmed: 1,
          submittedItemIds: [ITEM_ID],
          refused: [{ documentId: 'doc-1', fileName: 'vazio.pdf', reason: 'Arquivo vazio.' }],
        }),
      );
    }),
    http.post(apiUrl(`/upload/${TOKEN}/push`), async ({ request }) => {
      state.push.push(await request.json());
      return HttpResponse.json(envelope({ id: 'sub-1' }));
    }),
    http.post(apiUrl(`/upload/${TOKEN}/access`), () => {
      state.access += 1;
      return HttpResponse.json(
        envelope({ email: 'carla@mercado.com.br', name: 'Carla', nextStep: 'check_email' }),
      );
    }),
  );
  return state;
};

const subscription = {
  endpoint: 'https://push.example/sub',
  getKey: () => new Uint8Array([1, 2, 3]).buffer,
};

beforeEach(() => {
  vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted') });
  vi.stubGlobal('PushManager', class {});
  let current: typeof subscription | null = null;
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => current),
      subscribe: vi.fn(async () => (current = subscription)),
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('fluxo do envio público', () => {
  it('envia dois arquivos, mostra a recusa, liga os avisos e pede o acesso', async () => {
    const state = setup();
    const user = userEvent.setup();
    render(
      <AppProviders queryClient={makeQueryClient()}>
        <RouterProvider
          router={createMemoryRouter(routes, { initialEntries: [`/envio/${TOKEN}`] })}
        />
      </AppProviders>,
    );

    await user.click(await screen.findByRole('button', { name: /Extrato bancário/ }));
    const [input] = screen.getAllByLabelText(/Arraste os arquivos aqui ou toque para escolher/);
    await user.upload(input as HTMLInputElement, [
      new File(['%PDF'], 'extrato.pdf', { type: 'application/pdf' }),
      new File(['%PDF'], 'vazio.pdf', { type: 'application/pdf' }),
    ]);

    const feedback = await screen.findByRole('dialog', {
      name: 'Alguns arquivos não foram aceitos',
    });
    expect(within(feedback).getByText('Arquivo vazio.')).toBeInTheDocument();
    expect(
      within(feedback).getByText('Os outros 1 chegaram e já estão na lista.'),
    ).toBeInTheDocument();
    await user.click(within(feedback).getByRole('button', { name: 'Entendi' }));

    expect(await screen.findByText('Tudo enviado!')).toBeInTheDocument();
    expect(state.checklistCalls).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: 'Me avise neste aparelho' }));
    expect(await screen.findByText('Avisos ligados neste aparelho.')).toBeInTheDocument();
    expect(state.push[0]).toMatchObject({ endpoint: 'https://push.example/sub' });

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Me avise neste aparelho' }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Receber link de acesso' }));
    expect(await screen.findByText('Link de acesso enviado!')).toBeInTheDocument();
    expect(state.access).toBe(1);
    expect(screen.getByRole('link', { name: 'Acessar Minha Área' })).toHaveAttribute(
      'href',
      '/minha-area/acesso',
    );
  });
});

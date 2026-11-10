import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const BLIND =
  'Se o e-mail estiver cadastrado, você receberá instruções para recuperar seu link de envio em instantes.';

const mount = (
  path: string,
  onRecover: () => Response = () => HttpResponse.json(envelope({ ok: true })),
) => {
  const state = { confirms: [] as unknown[] };
  server.use(
    http.get(apiUrl('/auth/me'), () => new HttpResponse(null, { status: 401 })),
    http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
    http.post(apiUrl('/access/recover'), onRecover),
    http.post(apiUrl('/access/recover/confirm'), async ({ request }) => {
      state.confirms.push(await request.json());
      return HttpResponse.json(envelope({ ok: true }));
    }),
  );
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </AppProviders>,
  );
  return state;
};

const submitEmail = async (address: string) => {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/E-mail/), address);
  await user.click(screen.getByRole('button', { name: 'Enviar e-mail' }));
};

describe('RecoverLinkPage', () => {
  it.each([
    ['cadastrado', () => HttpResponse.json(envelope({ ok: true }))],
    ['desconhecido', () => HttpResponse.json(envelope({ ok: true }))],
    ['sem acesso', () => new HttpResponse(null, { status: 204 })],
  ])('e-mail %s mostra a mesma resposta cega', async (_label, response) => {
    mount('/perdi-meu-link', response);

    await submitEmail('carla@mercado.com.br');

    expect(await screen.findByText(BLIND)).toBeInTheDocument();
  });

  it('o 429 do limite mostra o erro genérico de recuperação', async () => {
    mount('/perdi-meu-link', () => new HttpResponse(null, { status: 429 }));

    await submitEmail('carla@mercado.com.br');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível solicitar a recuperação.',
    );
  });
});

describe('RecoverLinkConfirmPage', () => {
  it('não chama a API ao montar; só no clique', async () => {
    const state = mount('/perdi-meu-link/confirmar?token=tok-123');
    const user = userEvent.setup();

    expect(await screen.findByText('Confirmar recuperação')).toBeInTheDocument();
    expect(state.confirms).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Gerar novo link' }));

    expect(await screen.findByText('Link renovado')).toBeInTheDocument();
    expect(state.confirms).toEqual([{ token: 'tok-123' }]);
  });

  it('sem token mostra "Link inválido"', async () => {
    mount('/perdi-meu-link/confirmar');

    expect(await screen.findByText('Link inválido')).toBeInTheDocument();
  });
});

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '@/app/router/routes';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { createTestQueryClient } from '@/testing/test-utils';

const signInUrl = 'http://api.test/api/auth/sign-in/email';

const mountLogin = () => {
  let signedIn = false;
  server.use(
    http.get(apiUrl('/auth/me'), () =>
      signedIn
        ? HttpResponse.json(envelope(accountantSession()))
        : new HttpResponse(null, { status: 401 }),
    ),
    http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
    http.post(signInUrl, async ({ request }) => {
      const body = (await request.json()) as { password: string };
      if (body.password !== 'senha-forte-123') {
        return HttpResponse.json(
          { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' },
          { status: 401 },
        );
      }
      signedIn = true;
      return HttpResponse.json({ token: 't', user: { id: 'u1' } });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/entrar'] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

const fill = async (password: string) => {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/E-mail/), 'dono@exemplo.com.br');
  await user.type(screen.getByLabelText(/Senha/), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
};

describe('LoginPage', () => {
  it('credenciais erradas mostram "E-mail ou senha inválidos."', async () => {
    const router = mountLogin();

    await fill('errada-123');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('credenciais certas levam para /competencias', async () => {
    const router = mountLogin();

    await fill('senha-forte-123');

    expect(await screen.findByRole('heading', { name: 'Periods' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/competencias');
  });

  it('botão fica desabilitado até o formulário ser válido e os campos têm label e autocomplete', async () => {
    mountLogin();
    const email = await screen.findByLabelText(/E-mail/);
    const password = screen.getByLabelText(/Senha/);

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(email).toHaveAttribute('inputmode', 'email');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });

  it('mostra o erro do campo depois de sair dele vazio', async () => {
    const user = userEvent.setup();
    mountLogin();

    await user.click(await screen.findByLabelText(/E-mail/));
    await user.tab();

    expect(await screen.findByText('E-mail inválido.')).toBeInTheDocument();
  });
});

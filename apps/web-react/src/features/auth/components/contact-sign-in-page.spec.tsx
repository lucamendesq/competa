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

const signInUrl = 'http://api.test/api/auth/sign-in/email';
const magicLinkUrl = 'http://api.test/api/auth/sign-in/magic-link';

const mount = (path: string, { signedIn = false, hasPassword = true } = {}) => {
  const state = { signedIn, hasPassword, magicLinks: [] as unknown[], passwords: [] as unknown[] };
  server.use(
    http.get(apiUrl('/auth/me'), () => new HttpResponse(null, { status: 401 })),
    http.get(apiUrl('/my/profile'), () =>
      state.signedIn
        ? HttpResponse.json(envelope({ ...contactSession(), hasPassword: state.hasPassword }))
        : new HttpResponse(null, { status: 401 }),
    ),
    http.patch(apiUrl('/auth/device'), () => HttpResponse.json(envelope({ ok: true }))),
    http.get(apiUrl('/my/pending'), () => HttpResponse.json(envelope([]))),
    http.post(signInUrl, async ({ request }) => {
      const body = (await request.json()) as { password: string };
      if (body.password !== 'senha-forte-123') {
        return HttpResponse.json({ code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 });
      }
      state.signedIn = true;
      return HttpResponse.json({ token: 't', user: { id: 'u1' } });
    }),
    http.post(magicLinkUrl, async ({ request }) => {
      state.magicLinks.push(await request.json());
      return HttpResponse.json({ status: true });
    }),
    http.post(apiUrl('/my/password'), async ({ request }) => {
      state.passwords.push(await request.json());
      state.hasPassword = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { state, router };
};

describe('ContactSignInPage', () => {
  it('senha errada mostra "E-mail ou senha inválidos."', async () => {
    const { router } = mount('/minha-area/acesso');
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeDisabled();

    await user.type(
      await screen.findByLabelText(/Seu e-mail/, { selector: '#email-password' }),
      'carla@mercado.com.br',
    );
    await user.type(screen.getByLabelText('Sua senha'), 'errada-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(router.state.location.pathname).toBe('/minha-area/acesso');
  });

  it('senha certa entra em /minha-area/pendencias', async () => {
    const { router } = mount('/minha-area/acesso');
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText(/Seu e-mail/, { selector: '#email-password' }),
      'carla@mercado.com.br',
    );
    await user.type(screen.getByLabelText('Sua senha'), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/minha-area/pendencias'));
  });

  it('magic link mostra a mesma confirmação, sem dizer se o e-mail existe', async () => {
    const { state } = mount('/minha-area/acesso');
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText(/Seu e-mail/, { selector: '#link-email' }),
      'ninguem@exemplo.com',
    );
    await user.click(screen.getByRole('button', { name: 'Receber link por e-mail' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Enviamos um link de acesso para ninguem@exemplo.com. Abra o e-mail neste aparelho para entrar.',
    );
    expect(state.magicLinks[0]).toMatchObject({
      email: 'ninguem@exemplo.com',
      callbackURL: `${window.location.origin}/minha-area/pendencias`,
    });
  });
});

describe('ContactSetPasswordPage', () => {
  it('definir senha refaz o perfil e o "Criar senha" do cabeçalho some', async () => {
    const { state } = mount('/minha-area/definir-senha', { signedIn: true, hasPassword: false });
    const user = userEvent.setup();
    expect(await screen.findByRole('link', { name: 'Criar senha' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Senha/), 'senha-nova-123');
    await user.click(screen.getByRole('button', { name: 'Definir senha' }));

    expect(await screen.findByText('Senha definida')).toBeInTheDocument();
    expect(state.passwords).toEqual([{ password: 'senha-nova-123' }]);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Criar senha' })).not.toBeInTheDocument(),
    );
  });

  it('senha curta mantém o botão desabilitado e mostra o erro do contrato', async () => {
    mount('/minha-area/definir-senha', { signedIn: true, hasPassword: false });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Senha/), 'curta');
    expect(screen.getByRole('button', { name: 'Definir senha' })).toBeDisabled();
    await user.tab();

    expect(
      await screen.findByText('A senha precisa de pelo menos 8 caracteres.'),
    ).toBeInTheDocument();
  });
});

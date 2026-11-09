import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '@/app/router/routes';
import { server } from '@/testing/mocks/server';
import { mockSessionAs } from '@/testing/mocks/sessions';
import { createTestQueryClient } from '@/testing/test-utils';

const authUrl = (path: string) => `http://api.test/api/auth${path}`;

const mount = (path: string) => {
  mockSessionAs('guest');
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

describe('ForgotPasswordPage', () => {
  it.each(['dono@exemplo.com.br', 'ninguem@exemplo.com.br'])(
    'responde igual para %s e manda o link de volta para /redefinir-senha',
    async (email) => {
      const received: unknown[] = [];
      server.use(
        http.post(authUrl('/request-password-reset'), async ({ request }) => {
          received.push(await request.json());
          return HttpResponse.json({ status: true });
        }),
      );
      const user = userEvent.setup();
      mount('/esqueci-senha');

      await user.type(await screen.findByLabelText(/E-mail/), email);
      await user.click(screen.getByRole('button', { name: 'Enviar e-mail' }));

      expect(
        await screen.findByRole('heading', { name: 'Verifique seu e-mail' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Enviamos um link para você redefinir sua senha.'),
      ).toBeInTheDocument();
      expect(received[0]).toEqual({ email, redirectTo: `${location.origin}/redefinir-senha` });
    },
  );
});

describe('ResetPasswordPage', () => {
  it('sem token mostra o link inválido com o botão para pedir outro', async () => {
    mount('/redefinir-senha');

    expect(
      await screen.findByRole('heading', { name: 'Link inválido ou expirado' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir novo link' })).toHaveAttribute(
      'href',
      '/esqueci-senha',
    );
  });

  it('INVALID_TOKEN mostra o estado de link inválido', async () => {
    server.use(
      http.post(authUrl('/reset-password'), () =>
        HttpResponse.json({ code: 'INVALID_TOKEN', message: 'invalid token' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    mount('/redefinir-senha?token=x');

    await user.type(await screen.findByLabelText(/Nova senha/), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(
      await screen.findByRole('heading', { name: 'Link inválido ou expirado' }),
    ).toBeInTheDocument();
  });

  it('sucesso mostra "Senha alterada" com o link para /entrar', async () => {
    let sent: unknown;
    server.use(
      http.post(authUrl('/reset-password'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ status: true });
      }),
    );
    const user = userEvent.setup();
    mount('/redefinir-senha?token=abc');

    await user.type(await screen.findByLabelText(/Nova senha/), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByRole('heading', { name: 'Senha alterada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar no painel' })).toHaveAttribute(
      'href',
      '/entrar',
    );
    expect(sent).toMatchObject({ newPassword: 'senha-forte-123', token: 'abc' });
  });

  it('outro erro mostra a mensagem do store e mantém o formulário', async () => {
    server.use(
      http.post(authUrl('/reset-password'), () =>
        HttpResponse.json({ code: 'INTERNAL', message: 'x' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    mount('/redefinir-senha?token=abc');

    await user.type(await screen.findByLabelText(/Nova senha/), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível redefinir a senha. Tente de novo.',
    );
  });
});

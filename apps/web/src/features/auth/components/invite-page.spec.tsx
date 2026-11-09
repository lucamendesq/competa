import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '@/app/router/routes';
import { accountantSession, contactSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { createTestQueryClient } from '@/testing/test-utils';

const signInUrl = 'http://api.test/api/auth/sign-in/email';
const unauthorized = () => new HttpResponse(null, { status: 401 });

const mountInvite = (preview: Response | Record<string, unknown>) => {
  const state = {
    signedInAs: null as 'accountant' | 'contact' | null,
    posted: [] as [string, unknown][],
  };
  server.use(
    http.get(apiUrl('/invites/tok'), () =>
      preview instanceof Response ? preview : HttpResponse.json(envelope(preview)),
    ),
    http.get(apiUrl('/auth/me'), () =>
      state.signedInAs === 'accountant'
        ? HttpResponse.json(envelope(accountantSession()))
        : unauthorized(),
    ),
    http.get(apiUrl('/my/profile'), () =>
      state.signedInAs === 'contact'
        ? HttpResponse.json(envelope(contactSession()))
        : unauthorized(),
    ),
    http.post(apiUrl('/auth/sign-up'), async ({ request }) => {
      state.posted.push(['sign-up', await request.json()]);
      return HttpResponse.json(envelope({ ok: true }));
    }),
    http.post(apiUrl('/invites/tok/contact-account'), async ({ request }) => {
      state.posted.push(['contact-account', await request.json()]);
      return HttpResponse.json(envelope({ ok: true }));
    }),
    http.post(signInUrl, () => {
      state.signedInAs =
        (preview as { target?: string }).target === 'company' ? 'contact' : 'accountant';
      return HttpResponse.json({ token: 't', user: { id: 'u1' } });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/convite/tok'] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, state };
};

const fillAndSubmit = async () => {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/Seu nome/), 'Bruno Membro');
  await user.type(screen.getByLabelText(/Defina uma senha/), 'senha-forte-123');
  await user.click(screen.getByRole('button', { name: 'Criar conta' }));
};

describe('InvitePage', () => {
  it('convite já usado do Responsável mostra "Convite inválido" e leva à entrada da Minha Área', async () => {
    mountInvite(
      HttpResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'Este convite já foi utilizado.',
            details: { target: 'company' },
          },
        },
        { status: 409 },
      ),
    );

    expect(await screen.findByRole('heading', { name: 'Convite inválido' })).toBeInTheDocument();
    expect(screen.getByText('Este convite já foi utilizado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o login' })).toHaveAttribute(
      'href',
      '/minha-area/acesso',
    );
  });

  it('convite inválido de Contador leva a /entrar', async () => {
    mountInvite(
      HttpResponse.json(
        {
          error: {
            code: 'GONE',
            message: 'Este convite expirou. Peça um novo ao seu contador.',
            details: { target: 'accounting_firm' },
          },
        },
        { status: 410 },
      ),
    );

    expect(await screen.findByRole('link', { name: 'Ir para o login' })).toHaveAttribute(
      'href',
      '/entrar',
    );
  });

  it('Contador aceita, entra e vai para /competencias', async () => {
    const { router, state } = mountInvite({
      email: 'membro@exemplo.com.br',
      invitedBy: 'Contabilidade Exemplo',
      target: 'accounting_firm',
    });

    expect(
      await screen.findByText(/Você foi convidado para participar da contabilidade/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('membro@exemplo.com.br');
    await fillAndSubmit();

    expect(
      await screen.findByRole('heading', { name: 'Competências', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/competencias');
    expect(state.posted).toEqual([
      [
        'sign-up',
        {
          name: 'Bruno Membro',
          email: 'membro@exemplo.com.br',
          password: 'senha-forte-123',
          token: 'tok',
        },
      ],
    ]);
  });

  it('Responsável aceita, entra e vai para /minha-area/pendencias', async () => {
    const { router, state } = mountInvite({
      email: 'carla@mercado.com.br',
      invitedBy: 'Contabilidade Exemplo',
      companyName: 'Mercado Bom Preço',
      target: 'company',
    });

    expect(await screen.findByText(/convidou você para enviar documentos da/)).toBeInTheDocument();
    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: 'O que falta' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/minha-area/pendencias');
    expect(state.posted).toEqual([
      ['contact-account', { name: 'Bruno Membro', password: 'senha-forte-123' }],
    ]);
  });

  it('senha é obrigatória nos dois fluxos e os termos aparecem com links', async () => {
    const user = userEvent.setup();
    mountInvite({
      email: 'carla@mercado.com.br',
      invitedBy: 'X',
      companyName: 'Y',
      target: 'company',
    });

    await user.type(await screen.findByLabelText(/Seu nome/), 'Carla');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText('A senha precisa de pelo menos 8 caracteres.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos');
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
  });
});

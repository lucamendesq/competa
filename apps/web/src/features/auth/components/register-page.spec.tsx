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

const mountRegister = (onRegister?: (body: Record<string, unknown>) => Response) => {
  let registered = false;
  const received: Record<string, unknown>[] = [];
  server.use(
    http.get(apiUrl('/auth/me'), () =>
      registered
        ? HttpResponse.json(envelope(accountantSession()))
        : new HttpResponse(null, { status: 401 }),
    ),
    http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
    http.post(apiUrl('/auth/register'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      received.push(body);
      const custom = onRegister?.(body);
      if (custom) return custom;
      registered = true;
      return HttpResponse.json(envelope({ ok: true }), { status: 201 });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/cadastro'] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, received };
};

const fillStepOne = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(await screen.findByLabelText(/Seu nome completo/), 'Joana Teste');
  await user.type(screen.getByLabelText(/Seu e-mail profissional/), 'joana@teste.com.br');
  await user.type(screen.getByLabelText(/Senha/), 'senha-forte-123');
};

describe('RegisterPage', () => {
  it('só avança para o passo 2 com o passo 1 válido', async () => {
    const user = userEvent.setup();
    mountRegister();

    await user.type(await screen.findByLabelText(/Seu nome completo/), 'Joana');
    await user.type(screen.getByLabelText(/Senha/), 'curta');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    await user.clear(screen.getByLabelText(/Senha/));
    await user.type(screen.getByLabelText(/Seu e-mail profissional/), 'joana@teste.com.br');
    await user.type(screen.getByLabelText(/Senha/), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Passo 2 de 2: Sua contabilidade')).toBeInTheDocument();
  });

  it('Enter no passo 1 avança em vez de enviar o cadastro', async () => {
    const user = userEvent.setup();
    const { received } = mountRegister();

    await fillStepOne(user);
    await user.keyboard('{Enter}');

    expect(screen.getByText('Passo 2 de 2: Sua contabilidade')).toBeInTheDocument();
    expect(received).toHaveLength(0);
  });

  it('voltar preserva os valores do passo 1 e do passo 2', async () => {
    const user = userEvent.setup();
    mountRegister();
    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText(/Nome da Contabilidade/), 'Mendes Contabilidade');

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByLabelText(/Seu nome completo/)).toHaveValue('Joana Teste');
    expect(screen.getByLabelText(/Seu e-mail profissional/)).toHaveValue('joana@teste.com.br');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText(/Nome da Contabilidade/)).toHaveValue('Mendes Contabilidade');
  });

  it('aplica a máscara no CNPJ e mostra no campo o 422 do servidor', async () => {
    const user = userEvent.setup();
    mountRegister(() =>
      HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos.',
            details: [{ path: ['cnpj'], message: 'CNPJ já cadastrado em outra Contabilidade.' }],
          },
        },
        { status: 422 },
      ),
    );
    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText(/Nome da Contabilidade/), 'Mendes Contabilidade');
    await user.type(screen.getByLabelText(/CNPJ da Contabilidade/), '11222333000181');
    expect(screen.getByLabelText(/CNPJ da Contabilidade/)).toHaveValue('11.222.333/0001-81');

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const field = screen.getByLabelText(/CNPJ da Contabilidade/);
    expect(
      await screen.findAllByText('CNPJ já cadastrado em outra Contabilidade.'),
    ).not.toHaveLength(0);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/CNPJ já cadastrado em outra Contabilidade\./);
  });

  it('cria a conta, envia o CNPJ só quando preenchido e vai para /competencias', async () => {
    const user = userEvent.setup();
    const { router, received } = mountRegister();
    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByLabelText(/Nome da Contabilidade/), 'Mendes Contabilidade');

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByRole('heading', { name: 'Competências', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/competencias');
    expect(received[0]).toEqual({
      userName: 'Joana Teste',
      email: 'joana@teste.com.br',
      password: 'senha-forte-123',
      firmName: 'Mendes Contabilidade',
    });
  });

  it('tem os links para Termos de Uso e Privacidade', async () => {
    mountRegister();

    expect(await screen.findByRole('link', { name: 'Termos de Uso' })).toHaveAttribute(
      'href',
      '/termos',
    );
    expect(screen.getByRole('link', { name: 'Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
  });
});

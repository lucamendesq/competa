import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RequireContact } from '@/app/router/guards';
import { routes } from '@/app/router/routes';
import { mockSessionAs } from '@/testing/mocks/sessions';
import { createTestQueryClient } from '@/testing/test-utils';

const mount = (path: string, tree = routes) => {
  const router = createMemoryRouter(tree, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

describe('guards', () => {
  it('sem sessão, /competencias vai para /entrar', async () => {
    mockSessionAs('guest');
    const router = mount('/competencias');

    expect(
      await screen.findByRole('heading', { name: 'Acessar painel do Contador' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/competencias' } });
  });

  it('Responsável logado em /entrar vai para /minha-area/pendencias', async () => {
    mockSessionAs('contact');
    const router = mount('/entrar');

    expect(await screen.findByRole('heading', { name: 'O que falta' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/minha-area/pendencias');
  });

  it('Responsável logado em /competencias vai para /minha-area/pendencias', async () => {
    mockSessionAs('contact');
    const router = mount('/competencias');

    expect(await screen.findByRole('heading', { name: 'O que falta' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/minha-area/pendencias');
  });

  it('Contador em /minha-area/pendencias é mandado para /minha-area/acesso', async () => {
    mockSessionAs('accountant');
    const router = mount('/minha-area/pendencias', [
      { path: '/minha-area/acesso', element: <h1>acesso</h1> },
      {
        element: <RequireContact />,
        children: [{ path: '/minha-area/pendencias', element: <h1>pendencias</h1> }],
      },
    ]);

    expect(await screen.findByRole('heading', { name: 'acesso' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/minha-area/acesso');
  });

  it('com as rotas reais, o Contador acaba no painel (o /minha-area/acesso é só para visitantes)', async () => {
    mockSessionAs('accountant');
    const router = mount('/minha-area/pendencias');

    expect(
      await screen.findByRole('heading', { name: 'Competências', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/competencias');
  });
});

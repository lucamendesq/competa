import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RouteErrorState } from '@/app/router/route-error-state';
import { routes } from '@/app/router/routes';
import { ApiError } from '@/shared/lib/api-error';
import { mockSessionAs } from '@/testing/mocks/sessions';
import { createTestQueryClient } from '@/testing/test-utils';

const mount = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

describe('rotas', () => {
  it('/termos tem título próprio e /competencias volta para "Competa"', async () => {
    const router = mount('/termos');

    expect(await screen.findByRole('heading', { name: 'Termos de Uso' })).toBeInTheDocument();
    expect(document.title).toBe('Termos de Uso - Competa');

    await act(() => router.navigate('/competencias'));

    expect(await screen.findByRole('heading', { name: 'Periods' })).toBeInTheDocument();
    expect(document.title).toBe('Competa');
  });

  it('/privacidade mostra a política', async () => {
    mount('/privacidade');

    expect(
      await screen.findByRole('heading', { name: 'Política de Privacidade' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Política de Privacidade - Competa');
  });

  it('endereço desconhecido cai no 404 com o caminho digitado', async () => {
    mount('/qualquer-coisa?x=1');

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByText('/qualquer-coisa?x=1')).toBeInTheDocument();
    expect(document.title).toBe('Página não encontrada - Competa');
  });

  it.each([
    ['/', '/competencias', 'accountant'],
    ['/criar-conta', '/cadastro', 'guest'],
    ['/configuracoes', '/configuracoes/contabilidade', 'accountant'],
    ['/minha-area', '/minha-area/pendencias', 'contact'],
  ] as const)('redireciona %s para %s', async (from, to, who) => {
    mockSessionAs(who);
    const router = mount(from);

    await screen.findByRole('heading');
    expect(router.state.location.pathname).toBe(to);
  });

  it('cada página é carregada sob demanda', () => {
    const lazyPages: string[] = [];
    const walk = (list: RouteObject[]) => {
      for (const route of list) {
        if (route.lazy && route.path && route.path !== '/__ui') lazyPages.push(route.path);
        if (route.children) walk(route.children);
      }
    };
    walk(routes);

    expect(lazyPages).toHaveLength(29);
  });
});

describe('RouteErrorState', () => {
  function Broken(): never {
    throw new ApiError(500, { error: { code: 'INTERNAL', message: 'Falha ao carregar.' } }, 'x');
  }

  it('mostra o erro dentro do segmento e mantém o layout em volta', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <div>
              <nav>menu do painel</nav>
              <Outlet />
            </div>
          ),
          children: [
            { errorElement: <RouteErrorState />, children: [{ path: 'x', element: <Broken /> }] },
          ],
        },
      ],
      { initialEntries: ['/x'] },
    );
    const silence = console.error;
    console.error = () => undefined;
    render(<RouterProvider router={router} />);
    console.error = silence;

    expect(await screen.findByText('Falha ao carregar.')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar')).toBeInTheDocument();
    expect(screen.getByText('menu do painel')).toBeInTheDocument();
  });
});

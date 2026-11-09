import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useParams } from 'react-router';
import { apiUrl } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { renderHookWithProviders, renderWithProviders } from '@/testing/test-utils';

const getMe = async () => {
  const response = await fetch(apiUrl('/auth/me'));
  if (!response.ok) return null;
  const body = (await response.json()) as { data: { accountant: { name: string } } };
  return body.data;
};

function SessionName() {
  const me = useQuery({ queryKey: ['test', 'me'], queryFn: getMe });
  if (me.isPending) return <p>carregando</p>;
  if (me.isError) return <p>erro</p>;
  return <p>{me.data?.accountant.name ?? 'sem sessão'}</p>;
}

function RouteParam() {
  const { id } = useParams();
  return <p>competência {id}</p>;
}

describe('renderWithProviders', () => {
  it('resolve a sessão de GET /auth/me pelo handler do MSW', async () => {
    renderWithProviders(<SessionName />);

    expect(screen.getByText('carregando')).toBeInTheDocument();
    expect(await screen.findByText('Ana Dono')).toBeInTheDocument();
  });

  it('deixa o teste trocar a resposta de /auth/me', async () => {
    server.use(http.get(apiUrl('/auth/me'), () => new HttpResponse(null, { status: 401 })));

    renderWithProviders(<SessionName />);

    expect(await screen.findByText('sem sessão')).toBeInTheDocument();
  });

  it('monta a rota pedida no router em memória', () => {
    renderWithProviders(<RouteParam />, { route: '/competencias/42', path: '/competencias/:id' });

    expect(screen.getByText('competência 42')).toBeInTheDocument();
  });
});

describe('renderHookWithProviders', () => {
  it('roda um hook de query com um QueryClient novo por teste', async () => {
    const { result } = renderHookWithProviders(() =>
      useQuery({ queryKey: ['test', 'me'], queryFn: getMe }),
    );

    await expect.poll(() => result.current.data?.accountant.name).toBe('Ana Dono');
  });
});

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { api, onSessionExpired, parsed } from '@/shared/lib/api-client';
import { ApiError } from '@/shared/lib/api-error';
import { apiUrl } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const unauthorized = () => new HttpResponse(null, { status: 401 });

describe('api-client', () => {
  afterEach(() => onSessionExpired(() => undefined));

  it('devolve null em 401 de /auth/me sem disparar sessão expirada', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    server.use(http.get(apiUrl('/auth/me'), unauthorized));

    await expect(api.get('/auth/me')).resolves.toBeNull();
    expect(expired).not.toHaveBeenCalled();
  });

  it('devolve null em 401 de /my/profile sem disparar sessão expirada', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);

    await expect(api.get('/my/profile')).resolves.toBeNull();
    expect(expired).not.toHaveBeenCalled();
  });

  it('dispara sessão expirada e lança ApiError em 401 de outra rota', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    server.use(http.get(apiUrl('/periods'), unauthorized));

    await expect(api.get('/periods')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });

  it('desembrulha o envelope e limpa parâmetros vazios', async () => {
    let received = '';
    server.use(
      http.get(apiUrl('/companies'), ({ request }) => {
        received = new URL(request.url).search;
        return HttpResponse.json({ data: [{ id: 'a' }] });
      }),
    );

    await expect(
      api.get('/companies', { params: { page: 2, search: '', active: null, mine: true } }),
    ).resolves.toEqual([{ id: 'a' }]);
    expect(received).toBe('?page=2&mine=true');
  });

  it('mantém data e meta na paginação', async () => {
    server.use(
      http.get(apiUrl('/periods'), () =>
        HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0 } }),
      ),
    );

    await expect(api.page('/periods')).resolves.toEqual({
      data: [],
      meta: { page: 1, perPage: 20, total: 0 },
    });
  });

  it('envia o corpo como JSON e devolve o corpo de erro na ApiError', async () => {
    let sent: unknown;
    server.use(
      http.post(apiUrl('/periods'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'Competência já aberta.' } },
          { status: 409 },
        );
      }),
    );

    const failure = await api
      .post('/periods', { referenceMonth: '2026-11' })
      .catch((error) => error);

    expect(sent).toEqual({ referenceMonth: '2026-11' });
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 409,
      body: { error: { code: 'CONFLICT', message: 'Competência já aberta.' } },
    });
  });

  it('lança EMPTY_DOWNLOAD quando o blob vem vazio', async () => {
    server.use(
      http.get(
        apiUrl('/periods/1/zip'),
        () => new HttpResponse('', { headers: { 'Content-Type': 'application/zip' } }),
      ),
    );

    await expect(api.download('/periods/1/zip', 'competencia.zip')).rejects.toMatchObject({
      status: 404,
      body: { error: { code: 'EMPTY_DOWNLOAD', message: 'Nenhum documento para baixar.' } },
    });
  });

  it('repassa o AbortSignal para o fetch', async () => {
    server.use(http.get(apiUrl('/periods'), () => HttpResponse.json({ data: [] })));
    const controller = new AbortController();
    controller.abort();

    await expect(api.get('/periods', { signal: controller.signal })).rejects.toThrow();
  });

  it('valida a resposta com o schema do contrato', () => {
    const toNumber = parsed(z.object({ total: z.number() }));

    expect(toNumber({ total: 3 })).toEqual({ total: 3 });
    expect(() => toNumber({ total: 'três' })).toThrow();
  });
});

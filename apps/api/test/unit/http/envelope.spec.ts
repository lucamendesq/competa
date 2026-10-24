import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { describe, expect, it } from 'vitest';
import {
  JSON_UTF8,
  applyEtag,
  handler,
  paginated,
  toResponse,
  weakEtag,
} from '../../../src/http/envelope.js';

const bodyOf = (response: HttpServerResponse.HttpServerResponse): unknown => {
  const body = response.body;
  if (body._tag !== 'Uint8Array') return undefined;
  return JSON.parse(new TextDecoder().decode(body.body));
};

describe('toResponse', () => {
  it('embrulha objeto cru em { data }', () => {
    const response = toResponse(200)({ status: 'ok' });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({ data: { status: 'ok' } });
  });

  it('embrulha payload paginado em { data, meta } e descarta a marca', () => {
    const meta = { page: 1, perPage: 20, total: 3 };
    const response = toResponse(200)(paginated([{ id: 'a' }], meta));

    expect(bodyOf(response)).toEqual({ data: [{ id: 'a' }], meta });
  });

  it('lista não paginada sai sem a chave meta', () => {
    const response = toResponse(200)([{ id: 'a' }]);

    expect(bodyOf(response)).toEqual({ data: [{ id: 'a' }] });
    expect(JSON.stringify(bodyOf(response))).not.toContain('meta');
  });

  it('undefined e null viram corpo vazio no status pedido', () => {
    for (const payload of [undefined, null]) {
      const response = toResponse(204)(payload);
      expect(response.status).toBe(204);
      expect(response.body._tag).toBe('Empty');
    }
  });

  it('HttpServerResponse passa direto (stream / better-auth)', () => {
    const stream = HttpServerResponse.text('bytes', { contentType: 'text/csv' });

    expect(toResponse(200)(stream)).toBe(stream);
  });
});

describe('charset', () => {
  it('JSON sai com o mesmo content-type do res.json() do Express', () => {
    expect(toResponse(200)({ a: 1 }).headers['content-type']).toBe(JSON_UTF8);
  });
});

describe('weakEtag', () => {
  it('bate byte a byte com o que o Express gera (corpo real do 404 do Nest)', () => {
    const body = Buffer.from('{"error":{"code":"NOT_FOUND","message":"Recurso não encontrado."}}');

    expect(weakEtag(body)).toBe('W/"43-v/gZfKLJSpuInvcUDsuq1gu7aFc"');
  });
});

describe('applyEtag', () => {
  const ok = toResponse(200)({ status: 'ok' });
  const etag = weakEtag((ok.body as { body: Uint8Array }).body);

  it('marca toda resposta serializada, inclusive erro', () => {
    expect(applyEtag({ method: 'GET', headers: {} }, ok).headers.etag).toBe(etag);
    expect(
      applyEtag({ method: 'GET', headers: {} }, toResponse(404)({ e: 1 })).headers.etag,
    ).toBeDefined();
  });

  it('If-None-Match casando vira 304 sem corpo', () => {
    const revalidated = applyEtag({ method: 'GET', headers: { 'if-none-match': etag } }, ok);

    expect(revalidated.status).toBe(304);
    expect(revalidated.body._tag).toBe('Empty');
    expect(revalidated.headers.etag).toBe(etag);
  });

  it('aceita a forma forte do cliente e o curinga', () => {
    const strong = etag.slice(2);

    expect(applyEtag({ method: 'GET', headers: { 'if-none-match': strong } }, ok).status).toBe(304);
    expect(applyEtag({ method: 'GET', headers: { 'if-none-match': '*' } }, ok).status).toBe(304);
  });

  it('não revalida em método mutante, status não cacheável, no-cache ou tag diferente', () => {
    const cases = [
      applyEtag({ method: 'POST', headers: { 'if-none-match': etag } }, ok),
      applyEtag({ method: 'GET', headers: { 'if-none-match': etag } }, toResponse(404)({ e: 1 })),
      applyEtag(
        { method: 'GET', headers: { 'if-none-match': etag, 'cache-control': 'no-cache' } },
        ok,
      ),
      applyEtag({ method: 'GET', headers: { 'if-none-match': 'W/"outro"' } }, ok),
    ];

    for (const response of cases) expect(response.status).not.toBe(304);
  });

  it('stream não ganha ETag (o Express também não marca sendFile)', () => {
    const stream = HttpServerResponse.empty({ status: 200 });

    expect(applyEtag({ method: 'GET', headers: {} }, stream).headers.etag).toBeUndefined();
  });
});

describe('handler', () => {
  it('POST responde 201 por default; os outros métodos, 200', async () => {
    const post = await Effect.runPromise(handler('POST', Effect.succeed({ id: 'a' })));
    const get = await Effect.runPromise(handler('GET', Effect.succeed({ id: 'a' })));

    expect(post.status).toBe(201);
    expect(get.status).toBe(200);
  });

  it('status explícito vence o default (@HttpCode(204))', async () => {
    const response = await Effect.runPromise(handler('POST', Effect.succeed(undefined), 204));

    expect(response.status).toBe(204);
    expect(response.body._tag).toBe('Empty');
  });
});

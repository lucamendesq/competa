import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { ENVELOPED, type Enveloped } from '../lib/response.interceptor.js';

/** O que o `res.json()` do Express escreve — o charset faz parte dos bytes da resposta. */
export const JSON_UTF8 = 'application/json; charset=utf-8';

/** ETag weak do Express (pacote `etag`): `W/"<tamanho em hex>-<sha1 base64, 27 chars>"`. */
export const weakEtag = (body: Uint8Array) =>
  `W/"${body.length.toString(16)}-${createHash('sha1').update(body).digest('base64').slice(0, 27)}"`;

const NO_CACHE = /(?:^|,)\s*?no-cache\s*?(?:,|$)/;

const matchesEtag = (ifNoneMatch: string, etag: string) =>
  ifNoneMatch === '*' ||
  ifNoneMatch.split(',').some((raw) => {
    const candidate = raw.trim();
    return candidate === etag || `W/${candidate}` === etag || candidate === `W/${etag}`;
  });

/** Reproduz o fim do `res.send()` do Express: ETag em todo corpo serializado e 304 quando
 *  o cliente revalida com `If-None-Match` (só GET/HEAD, só status cacheável). */
export const applyEtag = (
  request: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string | undefined>>;
  },
  response: HttpServerResponse.HttpServerResponse,
): HttpServerResponse.HttpServerResponse => {
  if (response.body._tag !== 'Uint8Array' || response.headers.etag !== undefined) return response;

  const etag = weakEtag(response.body.body);
  const ifNoneMatch = request.headers['if-none-match'];
  const revalidating =
    (request.method === 'GET' || request.method === 'HEAD') &&
    ((response.status >= 200 && response.status < 300) || response.status === 304) &&
    !NO_CACHE.test(request.headers['cache-control'] ?? '') &&
    ifNoneMatch !== undefined &&
    matchesEtag(ifNoneMatch, etag);

  return HttpServerResponse.setHeader(
    revalidating ? HttpServerResponse.empty({ status: 304 }) : response,
    'etag',
    etag,
  );
};

/* O símbolo vem do interceptor antigo de propósito: `paginated()` dos repositórios marca o
 * payload com ESTA instância de Symbol, e uma cópia local nunca casaria. */
export const toResponse =
  (status: number) =>
  (payload: unknown): HttpServerResponse.HttpServerResponse => {
    if (HttpServerResponse.isHttpServerResponse(payload)) return payload;
    if (payload === undefined || payload === null) return HttpServerResponse.empty({ status });

    const body =
      typeof payload === 'object' && ENVELOPED in payload
        ? { data: (payload as Enveloped<unknown>).data, meta: (payload as Enveloped<unknown>).meta }
        : { data: payload };

    return HttpServerResponse.jsonUnsafe(body, { status, contentType: JSON_UTF8 });
  };

/** Status default do Nest: 201 em POST, 200 no resto. `@HttpCode(204)` vira `status: 204`. */
export const handler = <E, R>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  effect: Effect.Effect<unknown, E, R>,
  status = method === 'POST' ? 201 : 200,
) => Effect.map(effect, toResponse(status));

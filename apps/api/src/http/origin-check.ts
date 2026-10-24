import type { IncomingMessage, ServerResponse } from 'node:http';
import { JSON_UTF8, weakEtag } from './envelope.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Barreira CSRF complementar ao cookie `lax`: navegador manda `Origin` em toda requisição
 *  mutante cross-site, então Origin presente e fora da allowlist é forjado ou hostil.
 *  Origin ausente (curl, apps nativos, rotas token-based fora do navegador) passa — o que
 *  interessa barrar é o form-POST cross-site, que sempre carrega Origin. */
export const originAllowed = (
  method: string | undefined,
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean => !MUTATING.has(method ?? '') || !origin || allowedOrigins.includes(origin);

export const FORBIDDEN_ORIGIN = {
  error: { code: 'FORBIDDEN_ORIGIN', message: 'Origem não permitida.' },
};

/* Gêmeo node do `src/lib/origin-check.ts` (que depende de `res.json()` do Express). Mesma
 * decisão, mesmo corpo — só a escrita muda. */
export const originCheck =
  (allowedOrigins: readonly string[]) =>
  (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (originAllowed(request.method, request.headers.origin, allowedOrigins)) return next();

    const body = Buffer.from(JSON.stringify(FORBIDDEN_ORIGIN));
    response.writeHead(403, {
      'content-type': JSON_UTF8,
      'content-length': body.length,
      etag: weakEtag(body),
    });
    response.end(body);
  };

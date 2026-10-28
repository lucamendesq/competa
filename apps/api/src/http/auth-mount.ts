import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger } from '../lib/logger.js';
import { NodeHttpServerRequest } from '@effect/platform-node';
import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import auth from '../infra/auth/better-auth.js';
import { runGlobalStack } from './platform.js';

const logger = new Logger('AuthMount');

/**
 * `/api/auth/*` servido direto pelo better-auth: entra depois de helmet/origin-check/CORS e
 * antes de qualquer coisa do app.
 *
 * O que NÃO se aplica aqui, de propósito:
 * - perfil de autorização e throttle — a rota não passa por `route()`;
 * - envelope, ETag e mapa de erros — o better-auth serializa os próprios erros, e
 *   `auth.e2e.spec.ts` congela o corpo cru (`{ message: … }`) de um 404 dele;
 * - log de requisição — `/api/auth/*` não gera linha de log de requisição;
 * - limite de corpo — `toWeb` entrega o corpo como stream, que o `MaxBodySize` não mede.
 *
 * O método `*` registra também o path base `/api/auth` (`HttpRouter.js:77-82`).
 */
export const authMountRoutes = HttpRouter.add('*', '/api/auth/*', (request) =>
  Effect.gen(function* () {
    const nodeRequest = NodeHttpServerRequest.toIncomingMessage(request) as IncomingMessage;
    const nodeResponse = NodeHttpServerRequest.toServerResponse(request) as ServerResponse;

    const proceed = yield* Effect.promise(() =>
      runGlobalStack(nodeRequest, nodeResponse, { log: false }),
    );
    if (!proceed) return HttpServerResponse.empty();

    /* `x-internal-signup` é o que libera `/sign-up/email` no hook do better-auth, e quem o
     * põe é o `BetterAuthAdapter`, numa chamada EM PROCESSO (`auth.api.*`) — ele nunca
     * trafega pela rede. Chegando de fora, é forjado: vale cadastro aberto para qualquer
     * email. Some aqui, antes de o handler olhar. */
    delete nodeRequest.headers['x-internal-signup'];

    const webRequest = yield* HttpServerRequest.toWeb(request);
    const webResponse = yield* Effect.promise(() => auth.handler(webRequest));

    return HttpServerResponse.fromWeb(webResponse);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logger.error('Falha no handler do better-auth', cause.toString());
        return HttpServerResponse.empty({ status: 500 });
      }),
    ),
  ),
);

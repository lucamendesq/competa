import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger } from '../lib/logger.js';
import { NodeHttpServerRequest } from '@effect/platform-node';
import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import auth from '../infra/auth/better-auth.js';
import { runGlobalStack } from './platform.js';

const logger = new Logger('AuthMount');

/**
 * `/api/auth/*` servido direto pelo better-auth, como o `httpAdapter.use(authHandler)` do
 * `@thallesp/nestjs-better-auth` fazia: entra depois de helmet/origin-check/CORS e antes
 * de qualquer coisa do app.
 *
 * O que NÃO se aplica aqui, de propósito (era assim no Nest):
 * - guards globais — o mount era middleware Express, nunca um handler do roteador Nest;
 * - throttle — mesma razão; o `ThrottlerGuard` é um APP_GUARD;
 * - envelope, ETag e mapa de erros — o better-auth serializa os próprios erros, e
 *   `auth.e2e.spec.ts` congela o corpo cru (`{ message: … }`) de um 404 dele;
 * - log de requisição — o mount vem ANTES do middleware do nestjs-pino na pilha Express;
 * - limite de corpo — o `SkipBodyParsingMiddleware` pulava `/api/auth/*`, e `toWeb` entrega
 *   o corpo como stream, que o `MaxBodySize` não mede.
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

import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeHttpServerRequest } from '@effect/platform-node';
import { Effect } from 'effect';
import { HttpMethod, HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { InvalidUploadLink } from '../modules/auth/errors.js';
import { JSON_UTF8, applyEtag } from './envelope.js';
import { runGlobalStack } from './platform.js';

/**
 * Curinga de menor prioridade. Faz dois trabalhos:
 *
 * 1. **preflight** — o `cors()` da pilha global responde 204 a todo OPTIONS e encerra. Uma
 *    rota `OPTIONS /*` separada colidiria com este curinga (find-my-way recusa método
 *    duplicado no mesmo padrão);
 * 2. **404** — caminho desconhecido ou método errado.
 *
 * Sem throttle: só rota casada conta contra os baldes.
 */
const fallback = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const nodeRequest = NodeHttpServerRequest.toIncomingMessage(request) as IncomingMessage;
    const nodeResponse = NodeHttpServerRequest.toServerResponse(request) as ServerResponse;

    const proceed = yield* Effect.promise(() => runGlobalStack(nodeRequest, nodeResponse));
    if (!proceed) return HttpServerResponse.empty();

    /* Token acima do `maxParamLength` do roteador não casa `/upload/:token` e chega aqui; a
     * resposta tem de ser a mesma do token inválido, senão o tamanho vira um oráculo. */
    const error = nodeRequest.url?.startsWith('/upload/')
      ? new InvalidUploadLink()
      : { code: 'NOT_FOUND', message: 'Recurso não encontrado.' };

    return applyEtag(
      yield* HttpServerRequest.HttpServerRequest,
      HttpServerResponse.jsonUnsafe(
        { error: { code: error.code, message: error.message } },
        { status: 404, contentType: JSON_UTF8 },
      ),
    );
  });

/* Um curinga por método, e nunca HEAD: o roteador só serve HEAD pelo GET quando nada casa
 * HEAD, e um `'*'` casaria — toda rota GET responderia 404 a HEAD. */
export const fallbackRoutes = HttpRouter.addAll(
  [...HttpMethod.all]
    .filter((method) => method !== 'HEAD')
    .map((method) => HttpRouter.route(method, '/*', fallback)),
);

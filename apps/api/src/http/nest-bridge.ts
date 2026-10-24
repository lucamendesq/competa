import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeHttpServerRequest } from '@effect/platform-node';
import { Effect } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

export type NodeRequestListener = (request: IncomingMessage, response: ServerResponse) => void;

/** Rota curinga de menor prioridade: tudo que o shell Effect ainda não serve volta CRU para
 *  o Express do Nest, que escreve a resposta ele mesmo. Nada daqui pode aplicar envelope,
 *  mapa de erros, throttle ou origin-check — o Nest já aplica os dele, e processar duas
 *  vezes corromperia toda resposta. Quando o Express termina, `response.writableEnded` é
 *  `true` e o `handleResponse` do `@effect/platform-node` descarta o que devolvemos. */
export const nestFallback = (listener: NodeRequestListener) =>
  HttpRouter.add('*', '/*', (request) =>
    Effect.callback<HttpServerResponse.HttpServerResponse>((resume) => {
      const nodeRequest = NodeHttpServerRequest.toIncomingMessage(request) as IncomingMessage;
      const nodeResponse = NodeHttpServerRequest.toServerResponse(request) as ServerResponse;

      nodeResponse.once('close', () => resume(Effect.succeed(HttpServerResponse.empty())));
      listener(nodeRequest, nodeResponse);
    }),
  );

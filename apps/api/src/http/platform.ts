import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeHttpServerRequest } from '@effect/platform-node';
import cors from 'cors';
import { Context, Effect, Layer, type Types } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import helmet from 'helmet';
import { PinoLogger } from 'nestjs-pino';
import { pinoHttp, type Options as PinoHttpOptions } from 'pino-http';
import { allowedOrigins } from '../config/env.js';
import { pinoOptions } from '../config/logger.js';
import { AppError } from '../lib/app-error.js';
import { applyEtag } from './envelope.js';
import { handleCause } from './error-map.js';
import { originCheck } from './origin-check.js';
import {
  GLOBAL_BUCKETS,
  TooManyRequests,
  callerIp,
  makeThrottleStore,
  rateLimitHeaders,
  throttleKey,
  type Bucket,
  type ThrottleStore as ThrottleStoreService,
} from './throttle.js';

type NodeMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

/** `app.set('trust proxy', 1)` do Express. Lido no middleware porque quem decide é o boot. */
export const TrustProxy = Context.Reference<boolean>('competa/api/http/TrustProxy', {
  defaultValue: () => false,
});

/* Mesma pilha, na mesma ORDEM em que o Nest a monta hoje: `app.use(helmet())`,
 * `app.use(originCheck())`, `enableCors()` e, por último, o middleware do nestjs-pino
 * (middleware de módulo roda depois dos `app.use` globais). */
const globalStack: NodeMiddleware[] = [
  helmet() as NodeMiddleware,
  originCheck(allowedOrigins),
  cors({ origin: allowedOrigins, credentials: true }) as NodeMiddleware,
];

/* pino-http só pode ser construído depois do boot do Nest: reusa a instância raiz do
 * nestjs-pino para não abrir um segundo destino (nem um segundo worker de pino-pretty). */
let requestLog: NodeMiddleware | undefined;
const logRequest: NodeMiddleware = (request, response, next) => {
  requestLog ??= pinoHttp({
    ...(pinoOptions.pinoHttp as PinoHttpOptions),
    logger: PinoLogger.root,
  }) as NodeMiddleware;
  requestLog(request, response, next);
};

/** Roda a pilha Express contra os objetos node crus. `false` = algum middleware já
 *  respondeu (preflight do cors, 403 de origem) e a rota não deve rodar. */
const runStack = (request: IncomingMessage, response: ServerResponse) =>
  new Promise<boolean>((resolve) => {
    const answered = () => resolve(false);
    response.once('finish', answered);

    const stack = [...globalStack, logRequest];
    let index = 0;
    const next = () => {
      const middleware = stack[index++];
      if (middleware) return middleware(request, response, next);
      response.off('finish', answered);
      resolve(true);
    };
    next();
  });

/** Um store por app, não por processo: a suíte sobe dezenas de apps no MESMO processo, e um
 *  store de módulo vazaria contagem de uma suíte para a seguinte — 429 aleatório em spec que
 *  não tem nada a ver. Em produção (um app por processo) dá no mesmo.
 *  ponytail: em memória; vira Redis quando houver mais de uma instância. */
export const ThrottleStore = Context.Reference<ThrottleStoreService>(
  'competa/api/http/ThrottleStore',
  { defaultValue: () => makeThrottleStore() },
);

const Node = {
  request: (request: HttpServerRequest.HttpServerRequest) =>
    NodeHttpServerRequest.toIncomingMessage(request) as IncomingMessage,
  response: (request: HttpServerRequest.HttpServerRequest) =>
    NodeHttpServerRequest.toServerResponse(request) as ServerResponse,
};

/* `catchCause` zera o canal de erro, e o construtor de middleware exige
 * `Types.unhandled extends E`. Nada aqui produz esse erro — é só o marcador de tipo. */
type Served = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpServerRequest.HttpServerRequest
>;

const platform = (routeKey: string, buckets: readonly Bucket[]) =>
  HttpRouter.middleware<{ handles: AppError }>()((inner): Served =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const nodeRequest = Node.request(request);
      const nodeResponse = Node.response(request);

      const proceed = yield* Effect.promise(() => runStack(nodeRequest, nodeResponse));
      // o middleware escreveu a resposta; o que devolvermos é descartado (writableEnded)
      if (!proceed) return HttpServerResponse.empty();

      const tracker = callerIp(
        nodeRequest.headers as Record<string, string | undefined>,
        nodeRequest.socket.remoteAddress,
        yield* TrustProxy,
      );

      for (const bucket of buckets) {
        const result = (yield* ThrottleStore).hit(throttleKey(routeKey, bucket, tracker), bucket);
        for (const [name, value] of Object.entries(rateLimitHeaders(bucket, result))) {
          nodeResponse.setHeader(name, value);
        }
        if (!result.ok) return yield* Effect.fail(new TooManyRequests(result.retryAfterSec));
      }

      return yield* inner;
    }).pipe(
      Effect.catchCause(handleCause),
      // o ETag entra no fim, como no `res.send()` do Express: sucesso E erro o carregam
      Effect.flatMap((response) =>
        Effect.map(HttpServerRequest.HttpServerRequest, (request) => applyEtag(request, response)),
      ),
    ),
  );

/**
 * ÚNICA forma sancionada de registrar uma rota servida pelo shell Effect. Garante, na
 * ordem do Nest: helmet → origin-check → CORS → log de requisição → throttle → handler,
 * com o mapa de erros por cima. Rota nova que não passe por aqui perde tudo isso em
 * silêncio — nenhum spec assere esses headers.
 */
export const route = <E extends AppError, R>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: `/${string}`,
  handler:
    | Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
    | ((
        request: HttpServerRequest.HttpServerRequest,
      ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>),
  options?: { readonly throttle?: readonly Bucket[] },
) =>
  HttpRouter.add(method, path, handler).pipe(
    Layer.provide(platform(`${method} ${path}`, options?.throttle ?? GLOBAL_BUCKETS).layer),
  );

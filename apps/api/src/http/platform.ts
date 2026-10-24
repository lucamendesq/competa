import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeHttpServerRequest } from '@effect/platform-node';
import cors from 'cors';
import { Context, Effect, Layer, type Types } from 'effect';
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/http';
import helmet from 'helmet';
import { PinoLogger } from 'nestjs-pino';
import { pinoHttp, type Options as PinoHttpOptions } from 'pino-http';
import type * as z from 'zod';
import { allowedOrigins } from '../config/env.js';
import { pinoOptions } from '../config/logger.js';
import { AppError, BadRequest } from '../lib/app-error.js';
import { zodParse } from '../lib/zod-pipe.js';
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
  uploadTracker,
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

/* Tudo que uma rota pode falhar e o mapa de erros sabe traduzir: os erros do app mais os
 * do próprio parse da requisição (corpo inválido → 400, corpo grande demais → 413). */
type Failure = AppError | HttpServerError.HttpServerError;

/**
 * Perfil de autorização de uma rota — o que os `@UseGuards`/`@ContactRoute()` diziam. Roda
 * DEPOIS do throttle e ANTES do handler, e entrega o serviço de request (`FirmContext` e
 * companhia) que o handler exige por tipo. Os perfis moram em `middleware/auth.ts`.
 */
export type RouteProfile<Provides> = {
  readonly throttle?: readonly Bucket[];
  readonly apply: <A, E>(
    inner: Effect.Effect<A, E, Provides>,
  ) => Effect.Effect<A, E | Failure, HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext>;
};

/** Rota sem guard: `@PUBLIC()` / `@AllowAnonymous()`, ou simplesmente nenhum decorator. */
export const publicRoute: RouteProfile<never> = { apply: (inner) => inner };

/* `catchCause` zera o canal de erro, e o construtor de middleware exige
 * `Types.unhandled extends E`. Nada aqui produz esse erro — é só o marcador de tipo. */
type Served = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext
>;

const platform = <Provides>(
  routeKey: string,
  buckets: readonly Bucket[],
  profile: RouteProfile<Provides>,
) =>
  HttpRouter.middleware<{ handles: Failure; provides: Provides }>()((inner): Served =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const nodeRequest = Node.request(request);
      const nodeResponse = Node.response(request);

      const proceed = yield* Effect.promise(() => runStack(nodeRequest, nodeResponse));
      // o middleware escreveu a resposta; o que devolvermos é descartado (writableEnded)
      if (!proceed) return HttpServerResponse.empty();

      const ip = callerIp(
        nodeRequest.headers as Record<string, string | undefined>,
        nodeRequest.socket.remoteAddress,
        yield* TrustProxy,
      );
      const token = (yield* HttpRouter.params).token ?? '';

      for (const bucket of buckets) {
        const tracker = bucket.byToken === true ? uploadTracker(ip, token) : ip;
        const result = (yield* ThrottleStore).hit(throttleKey(routeKey, bucket, tracker), bucket);
        for (const [name, value] of Object.entries(rateLimitHeaders(bucket, result))) {
          nodeResponse.setHeader(name, value);
        }
        if (!result.ok) return yield* Effect.fail(new TooManyRequests(result.retryAfterSec));
      }

      return yield* profile.apply(inner);
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
 * ordem do Nest: helmet → origin-check → CORS → log de requisição → throttle → guard →
 * handler, com o mapa de erros por cima. Rota nova que não passe por aqui perde tudo isso
 * em silêncio — nenhum spec assere esses headers.
 *
 * Os três estágios estão escritos na ordem no corpo de `platform`, de propósito:
 * `Middleware.combine` existe, mas roda na ordem INVERSA da leitura.
 */
export const route = <E extends Failure, R, Provides = never>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: `/${string}`,
  handler:
    | Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
    | ((
        request: HttpServerRequest.HttpServerRequest,
      ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>),
  options?: {
    readonly throttle?: readonly Bucket[];
    readonly auth?: RouteProfile<Provides>;
    /** Balde compartilhado entre caminhos que no Nest eram O MESMO handler (a chave de lá é
     *  `Classe-handler`, não o path): `POST /auth/register` e `POST /public-signup`. */
    readonly throttleKey?: string;
  },
) => {
  const profile = options?.auth ?? (publicRoute as unknown as RouteProfile<Provides>);

  return HttpRouter.add(method, path, handler).pipe(
    Layer.provide(
      platform(
        options?.throttleKey ?? `${method} ${path}`,
        options?.throttle ?? profile.throttle ?? GLOBAL_BUCKETS,
        profile,
      ).layer,
    ),
  );
};

/** `@Body(zodPipe(Schema))`: mesmo `ValidationError`, com os `issues` no `details`.
 *
 *  Reproduz o `express.json({ strict: true })` que vinha antes do pipe, porque a diferença
 *  é observável: corpo VAZIO virava `{}` e o zod respondia 422 apontando o campo faltante,
 *  enquanto topo que não é objeto/array (`null`, `"texto"`, `3`) era recusado como 400 pelo
 *  parser antes de chegar ao zod. Sem isto cada rota migrada herdaria o desvio. */
export const body = <T>(schema: z.ZodType<T>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const text = yield* request.text.pipe(Effect.orElseSucceed(() => ''));

    // corpo vazio chegava ao pipe como `{}`: quem responde é o schema (422), não o parser
    if (text.trim() === '') return yield* zodFail(schema, {});

    const parsed = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => new BadRequest(),
    });

    // `strict: true`: só objeto ou array no topo; `null`, string e número são 400
    if (typeof parsed !== 'object' || parsed === null) return yield* Effect.fail(new BadRequest());

    return yield* zodFail(schema, parsed);
  });

/** `@Param(zodPipe(Schema))`. O roteador já decodifica cada segmento, como o Express. */
export const params = <T>(schema: z.ZodType<T>) =>
  Effect.flatMap(HttpRouter.params, (raw) => zodFail(schema, raw));

/** `@Query(zodPipe(Schema))`. */
export const query = <T>(schema: z.ZodType<T>) =>
  Effect.flatMap(HttpServerRequest.ParsedSearchParams, (raw) => zodFail(schema, raw));

const zodFail = <T>(schema: z.ZodType<T>, raw: unknown) =>
  Effect.try({ try: () => zodParse(schema, raw), catch: (error) => error as AppError });

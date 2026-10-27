import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeHttpServerRequest } from '@effect/platform-node';
import cors from 'cors';
import { Context, Effect, Layer, type Types } from 'effect';
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/http';
import helmet from 'helmet';
import type * as z from 'zod';
import { allowedOrigins } from '../config/env.js';
import type { AppContext } from '../effect/runtime.js';
import type { DbUnavailable } from '../infra/database/error.js';
import { AppError, BadRequest } from '../lib/app-error.js';
import { requestLogger } from '../lib/logger.js';
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

/** Se o XFF do proxy imediato vale (ver `callerIp`). Lido no middleware porque quem decide é
 *  o boot. */
export const TrustProxy = Context.Reference<boolean>('competa/api/http/TrustProxy', {
  defaultValue: () => false,
});

/* A ORDEM é fixa: helmet → origin-check → CORS e, por último (em `runGlobalStack`), o log
 * de requisição. */
const globalStack: NodeMiddleware[] = [
  helmet() as NodeMiddleware,
  originCheck(allowedOrigins),
  cors({ origin: allowedOrigins, credentials: true }) as NodeMiddleware,
];

/* A MESMA instância de pino-http que o `Logger` usa como raiz: duas abririam um segundo
 * destino (e um segundo worker de pino-pretty). Construída na primeira requisição. */
const logRequest: NodeMiddleware = (request, response, next) => {
  (requestLogger() as unknown as NodeMiddleware)(request, response, next);
};

/** Roda a pilha global contra os objetos node crus. `false` = algum middleware já
 *  respondeu (preflight do cors, 403 de origem) e a rota não deve rodar.
 *
 *  `log: false` é o mount do better-auth: `/api/auth/*` não gera linha de log de
 *  requisição. */
export const runGlobalStack = (
  request: IncomingMessage,
  response: ServerResponse,
  options?: { readonly log?: boolean },
) =>
  new Promise<boolean>((resolve) => {
    const answered = () => resolve(false);
    response.once('finish', answered);

    const stack = options?.log === false ? globalStack : [...globalStack, logRequest];
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

/* Tudo que uma rota pode falhar e o mapa de erros sabe traduzir: os erros do app, os do
 * próprio parse da requisição (corpo inválido → 400, corpo grande demais → 413) e o banco
 * fora do ar (503). Qualquer outro erro de banco morre como defeito no repositório. */
type Failure = AppError | HttpServerError.HttpServerError | DbUnavailable;

/**
 * Perfil de autorização de uma rota. Roda DEPOIS do throttle e ANTES do handler, e entrega
 * o serviço de request (`FirmContext` e companhia) que o handler exige por tipo. Os perfis
 * moram em `middleware/auth.ts`.
 */
export type RouteProfile<Provides> = {
  readonly throttle?: readonly Bucket[];
  readonly apply: <A, E>(
    inner: Effect.Effect<A, E, Provides>,
  ) => Effect.Effect<
    A,
    E | Failure,
    HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext | AppContext
  >;
};

export const publicRoute: RouteProfile<never> = { apply: (inner) => inner };

/* `catchCause` zera o canal de erro, e o construtor de middleware exige
 * `Types.unhandled extends E`. Nada aqui produz esse erro — é só o marcador de tipo. */
type Served = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext
>;

/* Os repositórios entram aqui, e não em cada rota, porque o `requires` de um middleware do
 * HttpRouter tem de ser vazio — o que ele exige é exigido da LAYER, construída uma vez. */
const platform = <Provides>(
  routeKey: string,
  buckets: readonly Bucket[],
  profile: RouteProfile<Provides>,
) =>
  HttpRouter.middleware<{ handles: Failure; provides: Provides }>()(
    Effect.map(
      Effect.context<AppContext>(),
      (services) =>
        (inner): Served =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const nodeRequest = Node.request(request);
            const nodeResponse = Node.response(request);

            const proceed = yield* Effect.promise(() => runGlobalStack(nodeRequest, nodeResponse));
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
              const result = (yield* ThrottleStore).hit(
                throttleKey(routeKey, bucket, tracker),
                bucket,
              );
              for (const [name, value] of Object.entries(rateLimitHeaders(bucket, result))) {
                nodeResponse.setHeader(name, value);
              }
              if (!result.ok) return yield* Effect.fail(new TooManyRequests(result.retryAfterSec));
            }

            return yield* profile.apply(inner);
          }).pipe(
            Effect.catchCause(handleCause),
            // o ETag entra no fim: sucesso E erro o carregam
            Effect.flatMap((response) =>
              Effect.map(HttpServerRequest.HttpServerRequest, (request) =>
                applyEtag(request, response),
              ),
            ),
            Effect.provideContext(services),
          ),
    ),
  );

/**
 * ÚNICA forma sancionada de registrar uma rota. Garante, nesta ordem: helmet →
 * origin-check → CORS → log de requisição → throttle → perfil de autorização →
 * handler, com o mapa de erros por cima. Rota nova que não passe por aqui perde tudo
 * isso em silêncio — nenhum spec assere esses headers.
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
  options: {
    readonly throttle?: readonly Bucket[];
    /** Obrigatório de propósito: rota sem perfil seria pública em silêncio. A pública declara
     *  `publicRoute`. */
    readonly auth: RouteProfile<Provides>;
    /** Balde compartilhado entre caminhos que são O MESMO handler: `POST /auth/register` e
     *  `POST /public-signup`. */
    readonly throttleKey?: string;
    /** O servidor interrompe a fibra quando o cliente desconecta. Escrita roda até o fim por
     *  padrão: interrompida no meio, desfaria o banco mas não o email enviado, o usuário
     *  criado no better-auth ou o evento já emitido. */
    readonly uninterruptible?: boolean;
  },
) => {
  const profile = options.auth;

  return HttpRouter.add(method, path, handler, {
    uninterruptible: options.uninterruptible ?? method !== 'GET',
  }).pipe(
    Layer.provide(
      platform(
        options.throttleKey ?? `${method} ${path}`,
        options.throttle ?? profile.throttle ?? GLOBAL_BUCKETS,
        profile,
      ).layer,
    ),
  );
};

/** `body`: mesmo `ValidationError` do zod, com os `issues` no `details`.
 *
 *  A diferença entre corpo vazio e topo inválido é observável: corpo VAZIO vira `{}` e o zod
 *  responde 422 apontando o campo faltante, enquanto topo que não é objeto/array (`null`,
 *  `"texto"`, `3`) é recusado como 400 antes de chegar ao zod. */
/** Corpo acima de 2 MiB: o `MaxBodySize` do servidor para a leitura e o mapa de erros traduz
 *  para 413. Só este motivo sobe — o resto do canal vira corpo vazio. */
const bodyTooLarge = (error: unknown) =>
  HttpServerError.isHttpServerError(error) &&
  error.reason._tag === 'RequestParseError' &&
  error.reason.reason === 'BodyTooLarge';

export const body = <T>(schema: z.ZodType<T>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const text = yield* request.text.pipe(
      Effect.catch((error) => (bodyTooLarge(error) ? Effect.fail(error) : Effect.succeed(''))),
    );

    // corpo vazio vale `{}`: quem responde é o schema (422), não o parser
    if (text.trim() === '') return yield* zodFail(schema, {});

    const parsed = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => new BadRequest(),
    });

    // `strict: true`: só objeto ou array no topo; `null`, string e número são 400
    if (typeof parsed !== 'object' || parsed === null) return yield* Effect.fail(new BadRequest());

    return yield* zodFail(schema, parsed);
  });

/** O roteador já decodifica cada segmento. */
export const params = <T>(schema: z.ZodType<T>) =>
  Effect.flatMap(HttpRouter.params, (raw) => zodFail(schema, raw));

export const query = <T>(schema: z.ZodType<T>) =>
  Effect.flatMap(HttpServerRequest.ParsedSearchParams, (raw) => zodFail(schema, raw));

const zodFail = <T>(schema: z.ZodType<T>, raw: unknown) =>
  Effect.try({ try: () => zodParse(schema, raw), catch: (error) => error as AppError });

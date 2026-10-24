# Strip Nest — platform design (fase final)

Documento de trabalho. Alvo: trocar a casca NestJS de `apps/api` por `effect/http` (core v4) +
`@effect/platform-node@4.0.6`, mantendo a suíte de caracterização (20 arquivos, 471 specs) passando
**sem editar nenhum `*.e2e.spec.ts`**.

Tudo abaixo foi verificado contra os `.d.ts`/`.js` instalados em
`apps/api/node_modules/{effect,@effect/platform-node}` (ambos `4.0.6`), e as quatro peças de risco
foram testadas de verdade com `node --input-type=module` (seção 11, "Probes"). Onde a API instalada
**não** faz o que o Nest fazia, está escrito `⚠️ GAP`.

Regra que governa o documento: **hard rule 6 — nenhuma mudança de comportamento**. Onde a paridade
exata custa caro ou é impossível, a divergência está marcada `🔸 DECISÃO HUMANA` e precisa de um
"ok" antes de virar código.

---

## 1. Esqueleto do servidor: `HttpRouter`, não `HttpApi`

**Recomendação: `HttpRouter` (handler-first). `HttpApi` está fora.**

| Restrição desta API                                                                            | `HttpApi` (schema-first)                                                                                                                                                                    | `HttpRouter` (handler-first)                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 97 handlers validados por **zod** de `@competa/contracts`                                      | Exige `Schema` do Effect em `params`/`query`/`payload`/`success`/`error`. Converter 97 schemas (com `.partial()`, `.extend()`, `.pick()`, defaults, locale pt) é o projeto inteiro de novo. | zod continua exatamente onde está; o router entrega `string`s crus e o handler chama `zodPipe`. |
| Envelope uniforme `{data}`/`{data,meta}`                                                       | `success` é por endpoint e é codificado pelo schema — ou 97 wrappers `Schema.Struct({data: ...})`, ou um encoder paralelo.                                                                  | Um helper de 12 linhas na borda de registro.                                                    |
| `StreamableFile` (3 rotas) + zip com abort no `close`                                          | Fora do modelo (success é um schema serializável).                                                                                                                                          | Handler devolve `HttpServerResponse.stream(...)` direto.                                        |
| better-auth em `/api/auth/*` (fetch-style, método `*`)                                         | Não expressável.                                                                                                                                                                            | `router.add('*', '/api/auth/*', ...)` — verificado.                                             |
| Webhook com corpo cru (HMAC)                                                                   | Pagaria o parse do schema antes do HMAC.                                                                                                                                                    | `request.arrayBuffer` lazy; HMAC primeiro.                                                      |
| 2 controllers com prefixo vazio, 1 com prefixo array, `upload/:token` dividido entre 2 classes | Grupos exigiriam reorganização.                                                                                                                                                             | Caminho literal por rota; a organização por arquivo some como problema.                         |

Decisão correlata: **não usar `HttpApiBuilder`, `HttpApiMiddleware`, `HttpApiSchema` em nada.** O
ganho (OpenAPI, cliente tipado) não é pedido por ninguém hoje e custaria a reescrita dos contratos.

### Forma geral

```ts
// src/http/server.ts
import { createServer } from 'node:http';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { NodeHttpServer } from '@effect/platform-node';

export const ServerLayer = HttpRouter.serve(
  Layer.mergeAll(
    ErrorMapperLayer, // HttpRouter.middleware(..., { global: true })
    RequestLoggerLayer, // idem (pino-http)
    SecurityHeadersLayer, // idem (helmet equivalente)
    OriginCheckLayer, // idem
    CorsLayer, // HttpRouter.cors({ allowedOrigins, credentials: true })
    AuthMountLayer, // /api/auth/*
    HealthRoutes,
    PeriodsRoutes,
    CompaniesRoutes /* … 23 grupos … */,
    NotFoundRoute, // catch-all '*' '/*' — ver §3
  ),
  { disableLogger: true, disableListenLog: true }, // pino-http faz o log
).pipe(Layer.provideMerge(NodeHttpServer.layer(createServer, { port })));
```

`HttpRouter.serve` tem opção `middleware`, mas **ela não serve para o mapa de erros**: o próprio
d.ts avisa que "changes to the response are not reflected in the final response sent to the client",
e o probe confirmou — status muda, **corpo sai vazio**. Todo middleware que mexe no corpo tem de ser
`HttpRouter.middleware(fn, { global: true })`.

### Declaração de rota (o "controller" novo)

```ts
// src/http/route.ts
import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import * as z from 'zod';
import { ValidationError } from '../lib/app-error.js';

/** zodPipe sem Nest: mesma mensagem, mesmo `issues` no `details`. */
export const parse = <T>(schema: z.ZodType<T>, value: unknown): Effect.Effect<T> =>
  Effect.suspend(() => {
    const result = schema.safeParse(value);
    return result.success
      ? Effect.succeed(result.data)
      : Effect.fail(new ValidationError('Dados inválidos.', result.error.issues));
  }) as Effect.Effect<T>;

export const body = <T>(schema: z.ZodType<T>) =>
  HttpServerRequest.HttpServerRequest.pipe(
    Effect.flatMap((r) => r.json),
    Effect.flatMap((raw) => parse(schema, raw)),
  );

export const params = <T>(schema: z.ZodType<T>) =>
  HttpRouter.params.pipe(Effect.flatMap((raw) => parse(schema, raw)));

export const query = <T>(schema: z.ZodType<T>) =>
  HttpServerRequest.ParsedSearchParams.pipe(Effect.flatMap((raw) => parse(schema, raw)));
```

`HttpRouter.params` e `HttpServerRequest.ParsedSearchParams` são **providos de graça** a toda rota
(`HttpRouter.Provided` inclui `HttpServerRequest | Scope | ParsedSearchParams | RouteContext` —
`HttpRouter.d.ts:497`).

⚠️ **GAP pequeno:** `ParsedSearchParams` é `Record<string, string | string[]>`; `@Query()` do Nest
passa por `qs` e produz também objetos aninhados (`a[b]=1`). Nenhum schema de query em uso depende
disso (`CompanyQuery`, `PaginationQuery`, `MessageListQuery`, `DocumentTypeQuery`, `PeriodIdQuery`,
`PeriodDetailQuery` são planos). Confirmar no sub-fase 3 por módulo.

---

## 2. Envelope de resposta

`ResponseInterceptor` vira **um helper na borda de registro da rota**, não um middleware — porque a
distinção "`StreamableFile` passa direto" já é a distinção "o handler devolveu um `HttpServerResponse`".

```ts
// src/http/envelope.ts
import { Effect } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

export const ENVELOPED = Symbol('enveloped'); // idêntico ao de hoje
export type Meta = { page: number; perPage: number; total: number };
export type Enveloped<T> = { data: T[]; meta: Meta; [ENVELOPED]: true };
export const paginated = <T>(data: T[], meta: Meta): Enveloped<T> => ({
  data,
  meta,
  [ENVELOPED]: true,
});

const envelope =
  (status: number) =>
  (value: unknown): HttpServerResponse.HttpServerResponse => {
    if (HttpServerResponse.isHttpServerResponse(value)) return value; // stream / better-auth
    if (value === undefined || value === null) return HttpServerResponse.empty({ status });
    if (typeof value === 'object' && ENVELOPED in value) {
      const e = value as Enveloped<unknown>;
      return HttpServerResponse.jsonUnsafe({ data: e.data, meta: e.meta }, { status });
    }
    return HttpServerResponse.jsonUnsafe({ data: value }, { status });
  };

/** Status default do Nest: 201 em POST, 200 no resto. @HttpCode(204) vira `status: 204`. */
export const handler = <E, R>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  effect: Effect.Effect<unknown, E, R>,
  status = method === 'POST' ? 201 : 200,
) => Effect.map(effect, envelope(status));
```

Pontos presos pela suíte e cobertos:

- `{data}` / `{data, meta}` e **`meta` ausente** (não `null`) quando a rota não é paginada
  (`checklists.e2e.spec.ts:165`).
- **201 em POST** é o default de 142 asserts; **7 handlers com `@HttpCode(204)`** passam `status: 204`
  explícito e devolvem `undefined` → `HttpServerResponse.empty({status:204})`, corpo genuinamente
  vazio (`fixtures.ts` faz `text ? JSON.parse(text) : undefined`; um `null` literal quebraria 3 specs).
- `DELETE /companies/:id`, `DELETE /whatsapp`, `DELETE /accountants/:id`, `DELETE /invites/:id`,
  `DELETE /companies/:id/contacts/:contactId/access` continuam **200 com corpo** (não passam 204).
- `GET /periods/:id/requests` devolve `paginated(...)` **ou** um array cru conforme a query — o helper
  não se importa, é o mesmo caminho.
- `GET /whatsapp/webhook` devolve `number` → vira `{"data": 12345}`. É o comportamento atual (e
  provavelmente errado para a Meta, bug não congelado) — **manter**.

---

## 3. Mapa de erros

`AppErrorFilter` vira **um `HttpRouter.middleware(..., { global: true })`**, com o corpo da função
`catch` copiado quase literalmente. Probe confirmou que esse middleware (a) consegue reescrever o
corpo, (b) captura falhas de middleware de rota (guard), (c) a ordem de merge no `Layer.mergeAll`
não importa (as dependências de tipo forçam a construção).

```ts
// src/http/error-mapper.ts
import { Cause, Effect } from 'effect';
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { APIError } from 'better-auth/api';
import * as Sentry from '@sentry/node';
import { AppError } from '../lib/app-error.js';
import env from '../config/env.js';

const describeError = (error: unknown, depth = 0): string => { /* cópia literal do filtro */ };

const fail = (status: number, body: object) => HttpServerResponse.jsonUnsafe({ error: body }, { status });

export const ErrorMapperLayer = HttpRouter.middleware()(
  (httpEffect) =>
    Effect.catchCause(httpEffect, (cause) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const e = Cause.squash(cause); // mesmo desembrulho que `src/effect/runtime.ts` já usa

        const logDenial = (code: string) =>
          Effect.sync(() => {
            const denied = `403 ${code}: ${request.method} ${request.originalUrl}`;
            logger.warn(denied);
            Sentry.captureMessage(denied, 'warning');
          });

        if (e instanceof AppError) {
          if (e.status === 403) yield* logDenial(e.code);
          return fail(e.status, {
            code: e.code,
            message: e.message,
            ...(e.details === undefined ? {} : { details: e.details }),
          });
        }

        if (e instanceof APIError) {
          const status = e.statusCode ?? 500;
          if (status === 403) yield* logDenial(e.body?.code ?? 'FORBIDDEN');
          if (status < 500) {
            return fail(status, {
              code: e.body?.code ?? 'AUTH_ERROR',
              message: e.body?.message ?? 'Erro de autenticação.',
            });
          }
        }

        // equivalentes das HttpException do Nest
        if (HttpServerError.isHttpServerError(e)) {
          const r = e.reason;
          if (r._tag === 'RouteNotFound')
            return fail(404, { code: 'NOT_FOUND', message: 'Recurso não encontrado.' });
          if (r._tag === 'RequestParseError' && r.reason === 'BodyTooLarge')
            return fail(413, { code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' });
          if (r._tag === 'RequestParseError')
            return fail(400, { code: 'BAD_REQUEST', message: r.description ?? 'Corpo inválido.' });
        }

        // ⚠️ ZodError NÃO tem branch aqui, de propósito (bug congelado #1 → 500 INTERNAL_ERROR)

        logger.error(`500 ${request.method} ${request.originalUrl}`, describeError(e));
        Sentry.captureException(e);
        return fail(500, {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno. Tente novamente.',
          ...(env.NODE_ENV === 'production' ? {} : {
            details: {
              name: e instanceof Error ? e.name : typeof e,
              message: e instanceof Error ? e.message : String(e),
              stack: describeError(e),
            },
          }),
        });
      }),
  { global: true },
);
```

Mapeamento `HttpException` → v4, item por item:

| Nest hoje                               | Fonte no shell novo                                                                                    | Status/código           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| `NotFoundException` do roteador         | **rota catch-all** `HttpRouter.add('*', '/*', …)` (ver abaixo)                                         | 404 `NOT_FOUND`         |
| 404 de handler                          | `AppError` subclasse `NotFound`                                                                        | inalterado              |
| 403 de guard                            | `AppError` subclasse `Forbidden` + `logDenial`                                                         | inalterado              |
| `PayloadTooLargeError` (limit 2mb)      | `HttpServerError.RequestParseError{reason:'BodyTooLarge'}` com `HttpIncomingMessage.MaxBodySize` = 2MB | 413 `PAYLOAD_TOO_LARGE` |
| `BadRequestException` (JSON malformado) | `RequestParseError{reason:'Parse'}`                                                                    | 400 `BAD_REQUEST`       |
| `UnauthorizedException`                 | nunca lançada pelo app (só `Unauthenticated`)                                                          | n/a                     |
| `ThrottlerException`                    | nosso `TooManyRequests extends AppError` (§5)                                                          | 429 `TOO_MANY_REQUESTS` |

**404 de rota inexistente:** o `RouteNotFound` é levantado _fora_ das rotas, então o middleware global
o vê — mas o caminho verificado e mais barato é registrar uma rota curinga de menor prioridade:

```ts
export const NotFoundRoute = HttpRouter.add(
  '*',
  '/*',
  Effect.succeed(
    HttpServerResponse.jsonUnsafe(
      { error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } },
      { status: 404 },
    ),
  ),
);
```

Probe: `/ok`→200, `/nope`→404, `/a/b/c`→404, `/`→404, **`POST /ok` (método errado)→404** — mesma
semântica do Express/Nest. O curinga **não** sombreia rotas específicas (find-my-way prioriza
estático > param > wildcard).

Dois casos que a suíte prende e que o mapa precisa **não** tocar:

1. **`/api/auth/*` serializa os próprios erros.** `auth.e2e.spec.ts:272-291` faz
   `expect(body).toEqual({ message: 'Cadastro aberto não existe…' })` em um 404 — corpo cru do
   better-auth, sem envelope. No shell novo isso sai de graça: o handler do mount devolve um
   `HttpServerResponse` pronto e nunca falha (§6).
2. **Seis specs congelam `500 INTERNAL_ERROR`** (`auth:592`, `companies:760`/`:862`, `periods:278`,
   `contacts:874`, `whatsapp:249`) e um deles (`whatsapp.e2e.spec.ts:251`) assere
   `details.message === 'Integração não ativa'` — ou seja, o payload de `details` dev-only do 500 é
   **contrato de teste**. Não simplificar.

---

## 4. Guards → middleware

### A primitiva

`HttpRouter.middleware()` (chamada sem argumentos devolve o construtor; o `Config` é parâmetro de
**tipo**) produz um `Middleware` cujo `.layer` se dá a uma rota com `Layer.provide`. A função recebe
o efeito interno, que _requer_ os serviços declarados em `provides`, e tem de provê-los:

```ts
HttpRouter.middleware<{ provides: FirmContext }>()((inner) =>
  Effect.gen(function* () {
    const ctx = /* … resolve … */;
    return yield* Effect.provideService(inner, FirmContext, ctx);
  }),
);
```

Probe confirmou: o serviço chega ao handler, a falha do middleware sobe ao mapa de erros, e
`HttpRouter.cors` é exatamente `middleware(HttpMiddleware.cors(opts), { global: true })`.

### Metadados sem decorator

O decorator existia porque o Nest montava a rota por reflexão. Aqui a rota é registrada à mão, então
**o metadado vira "qual middleware a rota recebe"**:

| Decorator hoje                                                         | Equivalente no shell novo                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `@PUBLIC()` / `@AllowAnonymous()` (mesma chave — 17 handlers)          | a rota simplesmente **não** recebe `firmRoute`                          |
| `@ContactRoute()` (10 handlers)                                        | `Layer.provide(contactRoute)`                                           |
| `@SessionRoute()` (1 handler: `PATCH /auth/device`)                    | `Layer.provide(sessionRoute)`                                           |
| `@RequiresPlan('periodZip')` (1 handler: `GET /periods/:id/zip`)       | `Layer.provide(firmRoute({ requires: 'periodZip' }))`                   |
| `@UseGuards(UploadTokenGuard)`                                         | `Layer.provide(uploadTokenRoute)`                                       |
| `@UseGuards(UploadThrottlerGuard, UploadTokenGuard)`                   | `Layer.provide(uploadPresignRoute)`                                     |
| `@UseGuards(ContactUploadGuard)`                                       | `Layer.provide(contactUploadRoute)`                                     |
| `@SkipThrottle({…})`                                                   | a rota não recebe o throttle global                                     |
| `@Throttle({default:{ttl,limit}})` (4 handlers)                        | `Layer.provide(throttled({ limit, ttl }))`                              |
| `@CurrentScope` / `@CurrentAccountantId` / `@CurrentPlan` / `@Session` | `const { scope, accountantId, planName, session } = yield* FirmContext` |
| `@CurrentContactScope` / `@CurrentUploadScope`                         | `yield* ContactContext` / `yield* UploadContext`                        |

### Serviços de request

```ts
// src/http/context.ts  — ÚNICO lugar onde toFirmScope/toContactScope/toUploadScope são chamados
export class FirmContext extends Context.Service<
  FirmContext,
  {
    readonly scope: FirmScope;
    readonly accountantId: string;
    readonly planName: string;
    readonly session: AuthSession;
  }
>()('competa/api/http/FirmContext') {}

export class ContactContext extends Context.Service<
  ContactContext,
  {
    readonly scope: ContactScope;
    readonly session: AuthSession;
  }
>()('competa/api/http/ContactContext') {}

export class UploadContext extends Context.Service<
  UploadContext,
  {
    readonly scope: UploadScope;
    readonly session?: AuthSession;
  }
>()('competa/api/http/UploadContext') {}

export class SessionContext extends Context.Service<SessionContext, AuthSession>()(
  'competa/api/http/SessionContext',
) {}
```

A regra "escopo branded nasce só no middleware de auth" fica **mais forte** do que hoje: o bloco de
exceção do ESLint para `toFirmScope`/`toContactScope`/`toUploadScope` passa a ser
`src/http/middleware/auth.ts` + `test/unit/**` (hoje é `modules/auth/*.guard.ts` + 1 cron + testes).

### Ordem de execução

Hoje: `ThrottlerGuard` → `TenantGuard` → `PlanGuard` (ordem dos `APP_GUARD` em `app.module.ts`).

`Middleware.combine` **existe**, mas o probe mostrou que a ordem é invertida em relação à leitura:
`A.combine(B)` roda **B primeiro**. Isso é uma armadilha de 3am.

**Recomendação: não usar `combine`.** Escrever um middleware por _perfil de rota_, com a ordem
explícita no corpo:

```ts
// src/http/middleware/auth.ts
export const firmRoute = (opts?: { requires?: PlanCapability; throttle?: Bucket[] }) =>
  HttpRouter.middleware<{ provides: FirmContext }>()((inner) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;

      yield* throttle(request, opts?.throttle ?? GLOBAL_BUCKETS); // 1. Throttler

      const session = yield* auth.getSession(request.headers); // 2. Tenant
      if (!session) return yield* Effect.fail(new Unauthenticated());
      const row = yield* accountants.findByAuthUserId(session.user.id);
      if (!row)
        return yield* Effect.fail(new Forbidden('Esta conta não pertence a uma Contabilidade.'));
      if (request.method !== 'GET') {
        const overdue =
          row.subscriptionStatus === 'OVERDUE' || row.subscriptionStatus === 'CANCELED';
        const trialExpired =
          row.subscriptionStatus === 'trialing' && row.trialEndsAt && isPast(row.trialEndsAt);
        if (overdue || trialExpired) return yield* Effect.fail(new PaymentRequired());
      }
      const ctx = {
        scope: toFirmScope(row.accountingFirmId),
        accountantId: row.id,
        planName: row.subscriptionPlanName ?? 'trial',
        session,
      };

      if (opts?.requires && !planAllows(ctx.planName, opts.requires)) {
        // 3. Plan
        yield* logPlanDenial(request, ctx, opts.requires);
        return yield* Effect.fail(new PlanCapabilityRequired(opts.requires));
      }

      yield* tagForPino(request, ctx); // §8: req.firmScope / req.accountantId p/ logger.ts
      return yield* Effect.provideService(inner, FirmContext, ctx);
    }),
  ).layer;
```

Perfis a escrever (6 no total, cobrindo os 97 handlers):

| Perfil                              | Rotas | Faz                                                                     |
| ----------------------------------- | ----- | ----------------------------------------------------------------------- |
| `firmRoute()`                       | 67    | throttle global → tenant → (plan)                                       |
| `firmRoute({requires:'periodZip'})` | 1     | idem + gate de capability                                               |
| `contactRoute()`                    | 8     | throttle → sessão → `ContactGuard` → `ContactContext`                   |
| `contactUploadRoute()`              | 2     | throttle → sessão → `ContactUploadGuard` → `UploadContext`              |
| `uploadTokenRoute()`                | 5     | throttle (ou `@Throttle` custom) → `UploadTokenGuard` → `UploadContext` |
| `uploadPresignRoute()`              | 1     | throttle **por token** (§5) → `UploadTokenGuard`                        |
| `publicRoute()` / nada              | 17    | só throttle (ou nada, p/ `/health` e `PUT /storage/local/:key`)         |

🔸 **DECISÃO HUMANA — `ContactUploadGuard` lê o corpo antes da validação.** Hoje ele faz
`http.body?.requestId` com o corpo **já parseado** pelo body-parser global, e passa o valor cru para
`findUploadOwnership` — é a causa do **bug congelado #8** (`requestId` não-uuid → 500 do Postgres,
`contacts.e2e.spec.ts`). No shell novo o corpo é lazy; para reproduzir o bug o middleware precisa
chamar `request.json` ele mesmo. **Isso funciona** — `HttpIncomingMessage.json` é memoizado por
request, então o handler relê o mesmo corpo depois. Reproduzir o bug é 2 linhas; só confirmar que
reproduzir é mesmo o que se quer.

---

## 5. Throttling

### O que o Nest faz de fato (lido em `@nestjs/throttler@6.5.0/dist/*.js`, não suposto)

1. A chave é `sha256(\`${ClassName}-${handlerName}-${throttlerName}-${tracker}\`)`→
**o balde é por handler**, não global por IP.`30/10s` é 30 requests _naquela rota_.
2. `tracker` = `req.ip` (com `trust proxy`, o XFF).
3. Storage: cada hit agenda um `setTimeout(ttl)` que decrementa → janela deslizante por hit.
   Estourou o limite → `isBlocked` por `blockDuration` (= `ttl` por default); **enquanto bloqueado,
   hits não contam**.
4. `setHeaders` default `true`: **toda** resposta leva `X-RateLimit-Limit`, `-Remaining`, `-Reset`
   (sufixados `-short` para o balde `short`); o 429 leva `Retry-After`.
5. `ThrottlerException` → `HttpException(429)` → `AppErrorFilter` → `{error:{code:'TOO_MANY_REQUESTS',
message:'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.'}}`.

### Substituto

Não há `RateLimiter` em `effect` v4 core (`effect/persistence/RateLimiter` é outra coisa — rate limit
de _cliente_, com backpressure, não um balde HTTP com 429). ~35 linhas próprias:

```ts
// src/http/throttle.ts
export type Bucket = { name: string; limit: number; ttlMs: number; blockMs?: number };
export const GLOBAL_BUCKETS: Bucket[] = [
  { name: 'short', limit: 30, ttlMs: 10_000 },
  { name: 'default', limit: 120, ttlMs: 60_000 },
];

type Entry = { hits: number[]; blockedUntil: number };

export class Throttler extends Context.Service<
  Throttler,
  {
    hit(
      key: string,
      b: Bucket,
    ): Effect.Effect<{ remaining: number; resetSec: number }, TooManyRequests>;
  }
>()('competa/api/http/Throttler') {
  static readonly layer = Layer.effect(
    Throttler,
    Effect.sync(() => {
      const store = new Map<string, Entry>(); // ponytail: in-memory; Redis quando houver 2+ instâncias
      return Throttler.of({
        hit: (key, b) =>
          Effect.suspend(() => {
            /* janela deslizante + block */
          }),
      });
    }),
  );
}

export class TooManyRequests extends AppError {
  readonly code = 'TOO_MANY_REQUESTS';
  readonly status = 429;
  constructor(readonly retryAfterSec: number) {
    super('Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.');
  }
}
```

Chave: `` `${routeKey}:${bucket.name}:${tracker}` ``, onde `routeKey` = `` `${method} ${pathPattern}` ``
(substitui `Class-handler` do Nest com a mesma granularidade por rota) e `tracker` = IP do cliente.

**IP do cliente** (equivale a `trust proxy: 1` do Express):

```ts
const clientIp = (request: HttpServerRequest, trustProxy: boolean) => {
  if (trustProxy) {
    const xff = request.headers['x-forwarded-for'];
    if (xff) return xff.split(',').pop()!.trim(); // Express trust proxy 1 = entrada mais à DIREITA
  }
  return Option.getOrElse(request.remoteAddress, () => 'unknown');
};
```

⚠️ **GAP — `HttpMiddleware.xForwardedHeaders` não serve aqui.** Existe (`HttpMiddleware.d.ts:250`) e é
melhor desenhado que o Express, mas o contrato é diferente: ele exige que o _peer_ esteja em
`trustedProxies` e **"when every address is trusted, the leftmost one is used"**. Um predicado
`() => true` (o análogo ingênuo de `trust proxy: 1`) passaria a usar a entrada mais à esquerda — a
que o cliente controla — e viraria um bypass de rate limit. As 5 linhas acima reproduzem o Express
exatamente. (Em produção, `fly-client-ip` seria estritamente mais seguro que ambos — o better-auth
já usa; 🔸 **DECISÃO HUMANA**, fora do escopo da paridade.)

### Números que a suíte prende

| Teste                        | Exigência                                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts.e2e.spec.ts:1023`  | `POST /access/recover` 3× → 201; 4ª → 429 `TOO_MANY_REQUESTS`. Balde `default` sobrescrito (`@Throttle{ttl:60s,limit:3}`); mesmo `x-forwarded-for` nas 4.                                                                                                 |
| `requests.e2e.spec.ts:1347`  | `POST /upload/:token/documents` 60× → 201; 61ª → 429; **outro token no mesmo IP → 201**. Balde `upload-presign` 60/60s chaveado `ip:token`.                                                                                                               |
| toda a suíte, implicitamente | `short` 30/10s por rota + XFF. `requests.e2e.spec.ts:56` documenta que describes longos só não estouram porque cada fixture tem IP próprio. **Se o shell novo ignorar XFF ou globalizar o balde, dezenas de specs não relacionados viram 429 aleatório.** |
| `smoke.e2e.spec.ts`          | `fetch` cru, **sem** XFF, bate `/health` e `/nao-existe`. `/health` tem `@SkipThrottle()` (só `default`!) → o `short` continua valendo nela; o 404 do curinga **não pode** passar por throttle (não tem perfil).                                          |

Pegadinhas a preservar literalmente:

- `@SkipThrottle()` nu pula **só** o balde `default`; `health.controller.ts` está assim e o `short`
  continua ativo. Reproduzir: `/health` recebe `throttled([{name:'short',…}])`, não `publicRoute()` sem throttle.
- `PUT /storage/local/:storageKey` e `POST /upload/:token/documents` pulam **os dois** baldes globais.
- `UploadThrottlerGuard` roda **além** do `@SkipThrottle` porque ignora os baldes nomeados. No shell
  novo isso é só o perfil `uploadPresignRoute` não incluir `GLOBAL_BUCKETS`.

🔸 **DECISÃO HUMANA — headers `X-RateLimit-*`.** Nenhum teste os assere, mas hoje saem em **toda**
resposta. Manter custa ~4 linhas (`Effect.map(inner, HttpServerResponse.setHeaders({...}))`);
removê-los é uma mudança de comportamento observável por clientes. **Recomendo manter**, junto com
`Retry-After` no 429.

---

## 6. Mount do better-auth

```ts
// src/http/auth-mount.ts
import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import auth from '../infra/auth/better-auth.js';

export const AuthMountLayer = HttpRouter.add('*', '/api/auth/*', (request) =>
  Effect.gen(function* () {
    const webRequest = yield* HttpServerRequest.toWeb(request);
    const webResponse = yield* Effect.promise(() => auth.handler(webRequest));
    return HttpServerResponse.fromWeb(webResponse);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logError('better-auth handler failed', cause).pipe(
        Effect.as(HttpServerResponse.empty({ status: 500 })),
      ),
    ),
  ),
);
```

- Método `*` + path `/api/auth/*`: verificado no `HttpRouter.js:77-82` — registra `router.all('/api/auth/*')`
  **e** `router.all('/api/auth')`, então o path base também casa. Testado: `/api/auth/sign-in/email`,
  `/api/auth/magic-link/verify` casam.
- **O corpo chega intacto porque não existe body-parser global.** Em `effect/http` o corpo é lazy
  (`HttpIncomingMessage.json/text/arrayBuffer/stream`), então toda a dança do `SkipBodyParsingMiddleware`
  do `@thallesp/nestjs-better-auth` (pular `/api/auth/*`, `verify: rawBodyParser`, `limit: '2mb'`)
  **desaparece**. Não é "reproduzir", é "deletar".
- Substitutos ponto a ponto da config `bodyParser` de hoje:

  | Config hoje                                  | Onde vive no shell novo                                                                                                                                                                                        |
  | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `json: { limit: '2mb' }`                     | `Layer.succeed(HttpIncomingMessage.MaxBodySize, ByteSize.megabytes(2))` no root → `RequestParseError{reason:'BodyTooLarge'}` → 413 `PAYLOAD_TOO_LARGE` (§3). Nenhum spec cobre; é a única garantia contra OOM. |
  | `urlencoded: { limit:'2mb', extended:true }` | nenhuma rota do app consome urlencoded; só o better-auth, que parseia sozinho. **Deletar.**                                                                                                                    |
  | `rawBody: true`                              | `POST /whatsapp/webhook` faz `const buf = yield* request.arrayBuffer` → HMAC → `JSON.parse`. Único consumidor.                                                                                                 |
  | pular o parser em `/api/auth/*`              | não existe parser a pular                                                                                                                                                                                      |

- **`x-internal-signup` continua funcionando sem tocar em nada**: o hook `hooks.before` vive dentro da
  instância `betterAuth()` (`src/infra/auth/better-auth.ts`), que o shell não toca. Os dois specs em
  `auth.e2e.spec.ts:272-328` (incluindo o **bug de segurança congelado #21**, header forjável) seguem
  verdes por construção. O 404 com corpo cru `{message:…}` também — este handler nunca falha, então o
  mapa de erros global não o vê.
- `BetterAuthAdapter` (`src/infra/auth/better-auth.adapter.ts`) perde `@Injectable` e vira
  `Context.Service<AuthProvider, …>`; o corpo não muda.

⚠️ **GAP — cookies.** `HttpServerResponse.fromWeb` preserva os headers da `Response` web. As fixtures
usam `res.headers.getSetCookie()` (undici) e `auth.e2e.spec.ts:521` assere `getSetCookie()` igual a
`[]`. Múltiplos `Set-Cookie` **têm de sair como headers separados**, não dobrados. Verificar na
sub-fase 1 com um teste do `/api/auth/sign-in/email` real — é o primeiro gate.

---

## 7. Crons

```ts
// src/modules/requests/deadline.cron.ts (novo)
import { Effect, Layer, Schedule } from 'effect';
import * as Sentry from '@sentry/node';

export class DeadlineSweeper extends Context.Service<
  DeadlineSweeper,
  {
    readonly daily: Effect.Effect<void>;
    readonly scan: (scope: FirmScope | null) => Effect.Effect<ScanResult>;
    readonly discardStaleUploads: Effect.Effect<number>;
    readonly purgeExpiredFiscalDocuments: Effect.Effect<number>;
  }
>()('competa/api/requests/DeadlineSweeper') {
  /* layer = Layer.effect(...) */
}

export const DeadlineCronLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sweeper = yield* DeadlineSweeper;
    const run = Effect.promise(() =>
      Sentry.withMonitor('deadline-daily', () => runtime.runPromise(sweeper.daily), {
        schedule: { type: 'crontab', value: '0 7 * * *' },
        checkinMargin: 5,
        maxRuntime: 30,
        timezone: 'America/Sao_Paulo',
      }),
    );
    yield* run.pipe(
      Effect.catchCause((cause) => Effect.logError('deadline sweep failed', cause)),
      Effect.repeat(Schedule.cron('0 7 * * *', 'America/Sao_Paulo')),
      Effect.orDie, // só CronParseError sobra — expressão ruim deve matar no boot
      Effect.forkScoped, // fiber morre quando o scope da layer fecha
    );
  }),
).pipe(Layer.provide(DeadlineSweeper.layer));
```

- `@Cron(CronExpression.EVERY_DAY_AT_7AM, {timeZone})` → `Schedule.cron('0 7 * * *', 'America/Sao_Paulo')`
  (`Schedule.d.ts:575`, aceita tz IANA direto). Reminders: `'0 9 * * *'`.
- `@SentryCron(slug, config)` → `Sentry.withMonitor(slug, fn, config)` de `@sentry/node` (verificado:
  `@sentry/node@10.74.0` já está instalado como dep transitiva; **promover a dep direta**).
- **Advisory lock inalterado**: `requests.withAdvisoryLock(42002 | 42001, …)` continua dentro de `daily`.
- `@nestjs/schedule` some. `EventEmitter2` continua por ora (ver §9).

**Seam do `runDeadlineSweep()`**: hoje é `app.get(DeadlineCron).daily()`. Vira um método do handle
devolvido por `createApp()` (§8), executando `DeadlineSweeper.daily` no runtime — **sem rota HTTP**,
como hoje. Os 2 specs (`requests.e2e.spec.ts:1707`, `:1726`) não mudam. `POST /deadlines/scan`
continua sendo a versão HTTP com escopo de firma.

---

## 8. Bootstrap + paridade do harness

```ts
// src/app.ts
export interface RunningApp {
  url: string;
  runDeadlineSweep(): Promise<void>;
  close(): Promise<void>;
}

export async function createApp(opts?: {
  port?: number;
  trustProxy?: boolean;
}): Promise<RunningApp> {
  const port = opts?.port ?? env.PORT;
  const trustProxy = opts?.trustProxy ?? env.NODE_ENV === 'production';

  const Full = ServerLayer(port, trustProxy).pipe(
    Layer.provideMerge(AppLayer), // src/effect/runtime.ts, já existe
  );
  const runtime = ManagedRuntime.make(Full);
  const ctx = await runtime.context();
  const server = Context.get(ctx, HttpServer.HttpServer);

  const url = HttpServer.formatAddress(server.address)
    .replace('[::]', '127.0.0.1')
    .replace('[::1]', '127.0.0.1');

  return {
    url,
    runDeadlineSweep: () => runtime.runPromise(DeadlineSweeper.use((s) => s.daily)),
    close: () => runtime.dispose(),
  };
}
```

Probe real (porta 0, fetch, dispose) rodou: `address` = `"[::]:50410"`, `formatAddress` →
`http://[::]:50410`, `/health` 200, `/nope` 404, `dispose()` encerra. **`[::]` é um caso novo** — o
`boot.ts` atual só troca `[::1]`.

`test/support/boot.ts` encolhe para:

```ts
import { createApp, type RunningApp } from '../../src/app.js';
export type { RunningApp };
export const bootApp = () => createApp({ port: 0, trustProxy: true });
```

- **`url` sem barra final**, origem parseável por `new URL()` — `contacts`/`requests`/`messaging`
  trocam `protocol`/`host` da URL presignada e a assinatura (path+query) sobrevive.
- **`trustProxy: true` no harness** é load-bearing: `src/app.ts:22` hoje só liga em produção e o
  `boot.ts` força. Mantido como parâmetro para não ligar XFF em dev por acidente.
- `close()` = `runtime.dispose()` → fecha o scope → crons interrompidos (`forkScoped`), servidor
  fechado, pool do pg encerrado (`Db.layer` já é `acquireRelease`). Substitui
  `enableShutdownHooks()`. Em `main.ts`: `process.on('SIGTERM', () => app.close())`.

**pino** (`src/config/logger.ts` tem WIP do usuário — **não mexer**): `pinoOptions.pinoHttp` é
consumido direto por `pinoHttp(...)` dentro de um `HttpRouter.middleware(..., {global:true})`,
usando `NodeHttpServerRequest.toIncomingMessage(request)` / `.toServerResponse(request)`
(`@effect/platform-node/dist/NodeHttpServerRequest.d.ts:24,35`). `customProps` lê `req.firmScope` /
`req.accountantId`, então `tagForPino` (§4) escreve esses dois campos no `IncomingMessage` — 2 linhas,
e `logger.ts` continua byte-idêntico. O hook `BOOT_CONTEXTS` vira código morto inofensivo (limpar
depois, não na migração). `HttpRouter.serve({ disableLogger: true, disableListenLog: true })` para o
logger embutido do Effect não duplicar linha (o probe mostrou `INFO … Sent HTTP response`).

**Sentry**: `src/instrument.ts` troca `@sentry/nestjs` por `@sentry/node` (mesma API `init`), continua
sendo o primeiro import de `main.ts`. `httpIntegration` do `@sentry/node` instrumenta `node:http`
sozinho, então o tracing de request sobrevive sem o `SentryModule`.

**helmet / CORS / origin-check**: `helmet()` é um middleware Express. `HttpRouter.cors` substitui
`enableCors`. Para helmet e `originCheck`, dois `HttpRouter.middleware(..., {global:true})` —
`originCheck` é cópia literal (10 linhas).

🔸 **DECISÃO HUMANA — helmet.** Nenhum header do helmet é asserido por nenhum spec (verificado: zero
ocorrências de `x-content-type-options`, `x-frame-options`, CSP, CORS em `test/`). Mas o comentário de
`app.ts:24` diz que `nosniff` + CSP são a **segunda barreira** de XSS depois da allowlist de
`content_type` em `GET /documents/:id/content` — e aquela rota serve conteúdo de terceiros. Opções:
(a) manter `helmet` como dep e chamá-lo pelo `IncomingMessage`/`ServerResponse` crus (funciona, ~6
linhas, zero risco de divergência); (b) reescrever os ~8 headers à mão. **Recomendo (a).**
⚠️ `originCheck` só tem a ramificação de **permitir** exercitada pela suíte (nenhum spec manda
`Origin`); a de negar não tem rede — copiar literal, não "melhorar".

---

## 9. Seams de provider

Os três itens de "Pending cleanups" do STATE deixam de ser dívida e viram a forma natural:

| Hoje                                                                                                                                                                                                                                            | No shell novo                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentsRepo` constrói `env.NODE_ENV === 'production' ? new R2Storage() : new LocalStorage()` **e** `storage.module.ts` repete a expressão → 2 `S3Client` em produção, log de boot mentindo                                                   | `Storage` como `Context.Service` (≈10 linhas, espelhando `Db`), com `layer = Layer.effect(...)` escolhendo o provider **uma vez**. `DocumentsRepo` e as 3 rotas de download `yield* Storage`. Devolve o seam que `verify-com-67-25.ts` teste 3 usava.                  |
| `MessagesRepo` constrói email/push/whatsapp dentro do `make`; o provider whatsapp de produção só entra por `await import()` memoizado por causa do ciclo ESM `runtime → message.repo → whatsapp.provider → whatsapp.repository(shim) → runtime` | O shim Nest `whatsapp.repository.ts` morre junto com `whatsapp.module.ts` → **o ciclo some** → import estático volta. `MessageProviders` vira uma layer (`Layer.mergeAll(EmailProvider.layer, PushProvider.layer, WhatsappProvider.layer)`) provida ao `MessagesRepo`. |
| Token Nest `MessageProvider` órfão (sem injetor, mas o Nest ainda o **constrói** no boot — 2º `new Resend(...)` em produção)                                                                                                                    | `messaging.module.ts` deletado → o registro órfão some sem ação própria.                                                                                                                                                                                               |
| `type Executor` duplicado em 4 repos                                                                                                                                                                                                            | hoist para `src/infra/database/effect.ts` (independente desta fase, pode ir antes).                                                                                                                                                                                    |

`EventEmitter2` (`@nestjs/event-emitter`) é o único pedaço de Nest que **não** tem substituto óbvio
barato. `src/lib/events.ts` + `emitAsync(...).includes(true)` (que o **bug congelado #13** depende de
quebrar) e os listeners em `modules/messaging/`.
🔸 **DECISÃO HUMANA:** o caminho preguiçoso é **manter `eventemitter2` como dep direta** (é uma
biblioteca standalone; `@nestjs/event-emitter` é só um wrapper de DI em volta dela) e instanciar uma
única `EventEmitter2` numa `Context.Service`. Zero mudança de semântica, zero risco para o bug #13.
Trocar por `PubSub`/`Queue` do Effect **mudaria** a semântica de `emitAsync` e quebraria specs. Não
fazer nesta branch.

---

## 10. Ordem de migração

Cada sub-fase é o trabalho de **um** agente, verificada por um subconjunto nomeado da suíte. O gate
final de todas é `pnpm --filter api test` verde + diff do inventário de rotas contra
`route-inventory.md` (97 handlers + `/api/auth/*`).

| #      | Sub-fase                                                                                                                                                                                                                                                                                | Entrega                                                                                                                                                                               | Gate                                                                                    | Risco |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----- |
| **F1** | **Spike do esqueleto, lado a lado.** `src/http/{server,envelope,error-mapper,throttle,route}.ts` + rota `/health` + mount `/api/auth/*` + catch-all 404 + `createApp({port,trustProxy})` novo em `src/app2.ts`. Nest intocado.                                                          | Um spec novo e **temporário** (`test/platform.spec.ts`, deletado na F8) que boota o `app2`, bate `/health`, `/nao-existe`, `POST /api/auth/sign-in/email` e confere `getSetCookie()`. | **Alto** — é onde `Set-Cookie` múltiplo, `[::]`, e a ordem das layers globais aparecem. |
| **F2** | **Middleware de auth.** Os 6 perfis de §4 + `FirmContext`/`ContactContext`/`UploadContext`. Ainda sem rota de negócio.                                                                                                                                                                  | `auth.e2e.spec.ts` ainda roda no Nest (não é gate); gate é portar **1** rota de cada perfil para o `app2` e repetir os asserts à mão no spec temporário.                              | Médio                                                                                   |
| **F3** | **Throttling.** `Throttler` + `clientIp` + baldes + headers `X-RateLimit-*` + `Retry-After`.                                                                                                                                                                                            | Portar `POST /access/recover` e `POST /upload/:token/documents` e rodar os 2 testes de 429 contra o `app2` (copiados para o spec temporário).                                         | **Alto** — números exatos, janela deslizante, `ip:token`.                               |
| **F4** | **Troca do boot.** `src/app.ts` passa a ser o `app2`; `main.ts`, `boot.ts`, pino, Sentry, helmet, origin-check, CORS. As 97 rotas ainda são servidas pelo Nest? **Não** — ponto sem volta. Então F4 **inclui** portar os 97 handlers. Quebrar em F4a–F4f por módulo, cada um um agente: |                                                                                                                                                                                       |                                                                                         |
| F4a    | `health`, `storage/local`, `push/vapid-key`, webhooks (`asaas`, `whatsapp`)                                                                                                                                                                                                             | `smoke`, `whatsapp.e2e.spec.ts`, `billing.e2e.spec.ts`                                                                                                                                | baixo                                                                                   |
| F4b    | `periods` (6) + `checklists` (16)                                                                                                                                                                                                                                                       | `periods.e2e.spec.ts`, `checklists.e2e.spec.ts`                                                                                                                                       | baixo — **inclui o bug #1 (ZodError→500)**                                              |
| F4c    | `companies` (17) + `document-types`                                                                                                                                                                                                                                                     | `companies.e2e.spec.ts`                                                                                                                                                               | médio — bugs #2/#3/#4; ordem `/usage` antes de `/:id`                                   |
| F4d    | `auth` (3) + `invites` (2) + `auth/register`+`public-signup` + `team` (7) + `billing` (2)                                                                                                                                                                                               | `auth.e2e.spec.ts`, `billing.e2e.spec.ts`                                                                                                                                             | médio — `Set-Cookie` manual, bugs #21/#22/#23                                           |
| F4e    | `contacts`/`my` (10) + `access/recover` (2) + `upload/:token` (5) + `invites/:token/contact-account`                                                                                                                                                                                    | `contacts.e2e.spec.ts`                                                                                                                                                                | **alto** — 3 perfis de guard, piso de latência de 700ms, bugs #8/#9                     |
| F4f    | `requests` (4) + `review` (6) + `messages` (4) + **`zip` (3)**                                                                                                                                                                                                                          | `requests.e2e.spec.ts`, `messaging.e2e.spec.ts`                                                                                                                                       | **o mais alto** — streaming, `ZipFlightService`, abort no `close`, bugs #13/#14/#16/#17 |
| **F5** | **Crons.** `DeadlineSweeper`/`RemindersRunner` + `Schedule.cron` + `Sentry.withMonitor` + `runDeadlineSweep` no handle.                                                                                                                                                                 | `requests.e2e.spec.ts:1707,1726`                                                                                                                                                      | médio                                                                                   |
| **F6** | **Seams de provider.** `Storage` service, layer de providers de messaging, quebra do ciclo ESM.                                                                                                                                                                                         | suíte inteira                                                                                                                                                                         | médio                                                                                   |
| **F7** | **Remoção de deps.** `@nestjs/*`, `rxjs`, `reflect-metadata`, `@thallesp/nestjs-better-auth`, `nestjs-pino`, `@sentry/nestjs`, `helmet`(?), `@nestjs/throttler`. `eventemitter2` entra como dep direta. `@sentry/node` idem. vitest sai do swc/decorators.                              | suíte inteira + `pnpm typecheck` + `pnpm build`                                                                                                                                       | médio — o swc transform de decorators em `vitest.config.ts` pode sair                   |
| **F8** | `test-quality-audit`, deletar o spec temporário, `create-pr` único.                                                                                                                                                                                                                     | —                                                                                                                                                                                     | —                                                                                       |

### Os três passos mais arriscados

1. **F4f (zip/streaming).** `ZipFlightService` solta a chave **quando o stream fecha**, não quando o
   handler retorna (`requests.e2e.spec.ts:1419-1429` tem um retry de 20×100ms _provando_ isso), e o
   `setErrorHandler` do `StreamableFile` mexe em `response.statusCode` no meio do stream. Em
   `effect/http`, `HttpServerResponse.stream(NodeStream.fromReadable(...))` não oferece um callback de
   "terminou". **Plano**: embrulhar o `Readable` do archiver com um `finally` que libera a chave do
   single-flight antes de virar `Stream`, e fazer o abort via `res.on('close')` no `ServerResponse`
   obtido por `NodeHttpServerRequest.toServerResponse`. ⚠️ **GAP confirmado** — não há equivalente de
   `setErrorHandler`; o erro no meio do stream vira um `ResponseError` com headers já enviados.
   Se não der para reproduzir o comportamento exato, **a opção honesta é deixar `zip.controller.ts`
   por último e, se necessário, pedir decisão humana antes de divergir.**
2. **F3 (throttling).** Um erro de ±1 na janela ou na chave não quebra o teste de 429 — quebra
   **dezenas de specs não relacionados** com 429 espúrios, e o sintoma não aponta para a causa. Gate
   obrigatório: rodar a suíte **inteira** 2× seguidas ao fim da F3/F4.
3. **F4e (perfis de guard).** Três perfis distintos sobre `upload/:token`, mais o `ContactUploadGuard`
   lendo o corpo antes da validação. É onde os bugs congelados #8 e #9 moram.

### Se um bug congelado não reproduzir

Ordem de recurso, da mais barata à mais cara:

1. **Reproduzir a causa, não o efeito.** Os 23 bugs são todos "o shell não tem branch para X".
   O 500 do #1 existe porque `ZodError` não casa com nada no filtro — basta **não adicionar** o branch.
   O 500 do #8 existe porque o guard lê o corpo cru — basta ler `request.json` no middleware.
2. Se a causa não existir mais no shell novo (ex.: um erro do Express que não tem análogo), **parar e
   escrever o caso em `docs/strip-nest/STATE.md` sob "Fase final — divergências"**, com: spec, linha,
   comportamento Nest, comportamento Effect, e o custo de forçar a paridade.
3. **Nunca** editar o spec para acomodar o shell novo. Se a paridade custar mais do que o bug vale,
   isso é uma decisão de produto (o bug é conhecido e congelado de propósito) — 🔸 **DECISÃO HUMANA**,
   que pode liberar "corrige o bug e ajusta o spec **num commit separado e explícito**".

---

## 11. Probes — o que foi verificado de verdade

Rodados com `cd apps/api && node --input-type=module -e '…'`, contra os pacotes instalados.

| Afirmação                                                                                                            | Resultado                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `HttpRouter.middleware()((inner) => …)` provê serviço ao handler                                                     | ✅ `/scoped` → `{"data":{"scope":"f1"}}`                                               |
| Falha de middleware de rota chega ao mapa de erros global                                                            | ✅ 401 mapeado, com e sem reordenar o `mergeAll`                                       |
| `HttpRouter.middleware(fn, {global:true})` **consegue** reescrever o corpo                                           | ✅                                                                                     |
| Opção `middleware` de `serve`/`toWebHandler` **não** consegue (corpo sai vazio)                                      | ✅ confirmado o aviso do d.ts — por isso o mapa de erros é `{global:true}`             |
| `A.combine(B)` roda **B primeiro** (ordem invertida)                                                                 | ✅ — motivo de não usar `combine`                                                      |
| Catch-all `add('*','/*',…)` → 404 em `/nope`, `/a/b/c`, `/`, e em método errado; não sombreia rotas                  | ✅                                                                                     |
| find-my-way aceita nomes de param diferentes na mesma posição (`/companies/:id` + `/companies/:companyId/checklist`) | ✅ sem conflito; `params` corretos                                                     |
| `add('*','/api/auth/*')` registra também `/api/auth`                                                                 | ✅ (`HttpRouter.js:77-82`)                                                             |
| `NodeHttpServer.layer(createServer,{port:0})` + `ManagedRuntime.context()` → `HttpServer.address`                    | ✅ `"[::]:50410"`; `formatAddress` → `http://[::]:50410`; `dispose()` encerra          |
| `Cause.squash`, `ByteSize.megabytes`, `HttpIncomingMessage.MaxBodySize`, `Schedule.cron(expr, tz)` existem           | ✅                                                                                     |
| `@sentry/node@10.74.0` instalado (transitivo) e exporta `withMonitor`                                                | ✅                                                                                     |
| `FileInterceptor`/multipart/`@UseInterceptors` em uso no app                                                         | ❌ **zero** — upload é presign + PUT direto. `effect/http/Multipart` não é necessário. |
| `RateLimiter` HTTP em `effect` v4 core                                                                               | ❌ não existe (`effect/persistence/RateLimiter` é outra coisa) → implementação própria |
| `HttpMiddleware.xForwardedHeaders` reproduz `trust proxy: 1`                                                         | ❌ semântica diferente e insegura com predicado permissivo → 5 linhas próprias         |
| equivalente de `StreamableFile.setErrorHandler`                                                                      | ❌ não existe → ver risco #1                                                           |

---

## 12. Resumo das decisões que precisam de humano antes do código

1. **Headers `X-RateLimit-*`** em toda resposta: manter (recomendado) ou remover.
2. **helmet**: chamar o pacote pelos objetos node crus (recomendado) ou reescrever os headers.
3. **`eventemitter2` direto** em vez de `@nestjs/event-emitter` (recomendado) — não trocar por
   `PubSub` do Effect nesta branch.
4. **`ContactUploadGuard` lendo `request.json` no middleware** para preservar o bug #8.
5. **IP do cliente em produção**: replicar `trust proxy: 1` (paridade) ou passar a usar
   `fly-client-ip` (mais seguro, mudança de comportamento).
6. **`zip.controller.ts`**: se a paridade do `setErrorHandler`/abort-no-close não sair, qual é o
   comportamento aceitável.

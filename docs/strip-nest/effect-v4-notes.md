# Effect v4 — working reference for the apps/api migration

Verified against the installed packages: `effect@4.0.6`, `@effect/platform-node@4.0.6`, `@effect/vitest@4.0.6` (all resolved under `node_modules/.pnpm`, importable from apps/api). Web docs are mostly Effect v3 and wrong for this codebase — trust only the paths cited below.

## v3→v4 trap list

| v3                                 | v4 (installed)                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Either`                           | `Result` (`Result.succeed`/`Result.fail`, `isSuccess`/`isFailure`)                                                                                                                                                                                                                                                                                   | `effect/dist/Result.d.ts` exists; `Either.d.ts` does not                               |
| `Effect.catchAll`                  | `Effect.catch` (exported as `catch_ as catch`); `catchAllCause` → `Effect.catchCause`                                                                                                                                                                                                                                                                | `effect/dist/Effect.d.ts:4301,4337,5218`                                               |
| `Context.Tag`                      | `Context.Service` (the word `Tag` has zero occurrences in the module)                                                                                                                                                                                                                                                                                | `effect/dist/Context.d.ts:196`                                                         |
| `Layer.scoped`                     | gone — `Layer.effect` builds its effect inside the layer scope, so `Effect.acquireRelease` works directly in it                                                                                                                                                                                                                                      | `effect/dist/Layer.d.ts` (no `scoped` export; `effect` at 1166)                        |
| `@effect/schema`                   | `Schema` is in core: `import { Schema } from "effect"`; errors via `Schema.TaggedError<Self>()("Tag", fields, annotations?)`                                                                                                                                                                                                                         | `effect/dist/Schema.d.ts`; `effect/AGENTS.md`                                          |
| `@effect/platform` Http modules    | **moved into core**: `effect/http` (HttpRouter, HttpServerRequest, …) and `effect/http-api` (HttpApi, HttpApiBuilder, …). The installed `@effect/platform@0.97.2` is a **v3 package** (its package.json peer-dep is `effect: ^3.22.2`) — never import from it. `@effect/platform-node@4.0.6` is the v4 companion and itself imports `effect/http/*`. | `@effect/platform/package.json`; `@effect/platform-node/dist/NodeHttpServer.d.ts:6-10` |
| wrapping `Effect.gen` in functions | `Effect.fn("name")` (traced) / `Effect.fnUntraced` for reusable functions                                                                                                                                                                                                                                                                            | `effect/AGENTS.md` ("Writing Effect code")                                             |
| `Effect.fork` / `forkDaemon`       | `forkChild` / `forkScoped` / `forkIn` / `forkDetach` — no bare `fork`                                                                                                                                                                                                                                                                                | `effect/dist/Effect.d.ts:17083,17120,17210,17249`                                      |
| `TestClock` from `effect`          | from `effect/testing`                                                                                                                                                                                                                                                                                                                                | `effect/ai-docs/src/09_testing/10_effect-tests.ts`                                     |
| `Schedule<Env, In, Out>`           | `Schedule<Output, Input = unknown, Error = never, Env = never>`; combinators get metadata: `Schedule.while(({ input }) => ...)`                                                                                                                                                                                                                      | `effect/dist/Schedule.d.ts:45`                                                         |

## 1. Services: Context.Service + static Layer.effect

A service is a class extending `Context.Service<Self, Interface>()("pkg/path/Name")` with a static `layer = Layer.effect(Self, Effect.gen(...))` returning `Self.of({...})`. A service that needs another service just `yield*`s it inside the layer effect; the convention is `layerNoDeps` (requirements visible in the type) plus `layer` with deps provided. The class itself is an `Effect<Shape, never, Self>` and has `of`, `use`, `useSync`; the instance type is `Database["Service"]`. (`effect/AGENTS.md` "Writing Effect services"; `effect/dist/Context.d.ts:60-98,196`.)

```ts
import { Context, Effect, Layer, Schema } from 'effect';

export class DatabaseError extends Schema.TaggedError<DatabaseError>()('DatabaseError', {
  cause: Schema.Defect(),
}) {}

export class Database extends Context.Service<
  Database,
  {
    query(sql: string): Effect.Effect<Array<unknown>, DatabaseError>;
  }
>()('competa/api/Database') {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const query = Effect.fn('Database.query')(function* (sql: string) {
        return [] as Array<unknown>;
      });
      return Database.of({ query });
    }),
  );
}

export class UserRepo extends Context.Service<
  UserRepo,
  {
    findById(id: string): Effect.Effect<unknown, DatabaseError>;
  }
>()('competa/api/UserRepo') {
  static readonly layerNoDeps = Layer.effect(
    UserRepo,
    Effect.gen(function* () {
      const db = yield* Database; // dependency
      return UserRepo.of({ findById: (id) => db.query(`select ... ${id}`) });
    }),
  );
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Database.layer));
}
```

## 2. Layer composition

`Layer.provide(dep)` satisfies a layer's requirements and hides the dependency from the output; `Layer.provideMerge(dep)` satisfies them and also exposes the dependency's services downstream. `Layer.mergeAll(a, b, ...)` exists and combines sibling layers side by side (`effect/dist/Layer.d.ts:1434,1752,2169`). Composition root pattern: each service provides its own deps locally, then the root merges the top-level services — example in `effect/ai-docs/src/01_effect/03_services/20_layer-composition.ts`.

```ts
import { Layer } from 'effect';

// hide the dep:
const RepoLayer = UserRepo.layerNoDeps.pipe(Layer.provide(Database.layer));
// expose the dep too (tests often want this):
const RepoAndDb = UserRepo.layerNoDeps.pipe(Layer.provideMerge(Database.layer));

// one composition root for the app:
export const AppLayer = Layer.mergeAll(UserRepo.layer, Mailer.layer, CronJobsLayer).pipe(
  Layer.provideMerge(Database.layer),
); // shared singleton: provide once, at the root
```

Note: a dep provided separately to two layers is built twice; share singletons (the pg Pool!) by providing them once at the root with `provideMerge`, or pass the same `Layer` reference — layer memoization dedupes by reference within one runtime build.

## 3. Drizzle + pg inside Effect (no @effect/sql)

Drizzle is promise-based, so the bridge is `Effect.tryPromise({ try, catch })` for a typed error channel (`effect/dist/Effect.d.ts:1297`; plain `Effect.promise` is only for calls that cannot reject, `:1217`). The pg `Pool` is a resource: acquire/release it with `Effect.acquireRelease` _inside_ `Layer.effect` — the layer scope closes the pool on shutdown (`effect/dist/Effect.d.ts:12670`; pattern from `effect/ai-docs/src/01_effect/05_resources/10_acquire-release.ts`, which manages a nodemailer transport the same way).

```ts
import { Context, Effect, Layer, Schema } from 'effect';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema.js';

export class DbError extends Schema.TaggedError<DbError>()('DbError', {
  cause: Schema.Defect(),
}) {}

export class Db extends Context.Service<
  Db,
  {
    use<A>(f: (db: NodePgDatabase<typeof schema>) => Promise<A>): Effect.Effect<A, DbError>;
  }
>()('competa/api/Db') {
  static readonly layer = Layer.effect(
    Db,
    Effect.gen(function* () {
      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => new Pool({ connectionString: process.env.DATABASE_URL })),
        (pool) => Effect.promise(() => pool.end()),
      );
      const db = drizzle(pool, { schema });
      return Db.of({
        use: (f) =>
          Effect.tryPromise({ try: () => f(db), catch: (cause) => new DbError({ cause }) }),
      });
    }),
  );
}

// repos then stay one-liners:
// const users = yield* db.use((d) => d.query.users.findMany())
```

## 4. HttpApi server (and the raw HttpRouter escape hatch)

Everything imports from `effect/http` and `effect/http-api`. Endpoints use an options object: `HttpApiEndpoint.get("name", "/:id", { params, query, payload, success, error })`; path params are coerced from strings by schema; error status comes from `HttpApiSchema.status(404)` on the error schema or the `{ httpApiStatus: 401 }` annotation (3rd arg) on `Schema.TaggedError` (`effect/ai-docs/src/51_http-server/fixtures/api/Users.ts`, `.../Authorization.ts`; `effect/dist/http-api/HttpApiSchema.d.ts:25`). Middleware is `HttpApiMiddleware.Service<Self, { provides, requires }>` with optional `security` and `error`, attached via `.middleware(Authorization)` on a group or endpoint. Serving: `HttpApiBuilder.group` implements a group as a Layer, `HttpApiBuilder.layer(Api)` turns the API into routes, `HttpRouter.serve(routes)` + `NodeHttpServer.layer(createServer, { port })` + `Layer.launch` runs it (`effect/ai-docs/src/51_http-server/10_basics.ts`; `@effect/platform-node/dist/NodeHttpServer.d.ts:124`).

```ts
import { createServer } from 'node:http';
import { Effect, Layer, Schema } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';

class UsersGroup extends HttpApiGroup.make('users')
  .add(
    HttpApiEndpoint.get('getById', '/:id', {
      params: { id: Schema.String },
      success: Schema.Struct({ id: Schema.String, name: Schema.String }),
      error: UserNotFound, // Schema.TaggedError with { httpApiStatus: 404 }
    }),
  )
  .prefix('/users') {}

class Api extends HttpApi.make('competa-api').add(UsersGroup) {}

const UsersHandlers = HttpApiBuilder.group(
  Api,
  'users',
  Effect.fn(function* (handlers) {
    const repo = yield* UserRepo;
    return handlers.handleAll({
      getById: ({ params }) => repo.findById(params.id).pipe(Effect.orDie),
    });
  }),
).pipe(Layer.provide(UserRepo.layer));

const ApiRoutes = HttpApiBuilder.layer(Api).pipe(Layer.provide(UsersHandlers));

// Raw escape hatch: register plain routes on the HttpRouter service.
// handler: (request: HttpServerRequest) => Effect<HttpServerResponse, E, R>
const RawRoutes = HttpRouter.use((router) =>
  router.add('GET', '/healthz', HttpServerResponse.text('ok')),
);

export const ServerLayer = HttpRouter.serve(Layer.mergeAll(ApiRoutes, RawRoutes)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
);

Layer.launch(ServerLayer).pipe(NodeRuntime.runMain);
```

Web interop (both directions exist): `HttpServerRequest.toWeb(req, { signal? })` → `Effect<Request, RequestError>` (`effect/dist/http/HttpServerRequest.d.ts:335`; also sync `toWebResult`, `:319`) and `HttpServerResponse.fromWeb(response: Response)` → `HttpServerResponse` (sync, `effect/dist/http/HttpServerResponse.d.ts:960`). `HttpRouter.toWebHandler(layer)` builds a fetch-style `{ handler, dispose }` for tests/serverless (`effect/dist/http/HttpRouter.d.ts:787`).

## 5. Cron jobs replacing @nestjs/schedule

`Schedule.cron` takes a 5-field cron string directly, with an optional IANA time zone: `Schedule.cron("0 3 * * *", "America/Sao_Paulo")` → `Schedule<Duration, unknown, CronParseError>` (`effect/dist/Schedule.d.ts:575-612`; there is also a standalone `Cron` module with `parse`/`parseUnsafe`/`next`, `effect/dist/Cron.d.ts`). The background-job pattern is a `Layer.effectDiscard` that forks the repeating effect with `Effect.forkScoped` — the fiber is interrupted when the layer scope closes (`effect/ai-docs/src/01_effect/05_resources/20_layer-side-effects.ts`; `Layer.effectDiscard` at `effect/dist/Layer.d.ts:1318`). `CronParseError` lands in the repeat's error channel; `orDie` it after catching real job errors.

```ts
import { Effect, Layer, Schedule } from 'effect';

export const NightlySweepLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sweeper = yield* Sweeper; // use services from the composition root
    yield* sweeper.run.pipe(
      Effect.catchCause((cause) => Effect.logError('nightly sweep failed', cause)),
      Effect.repeat(Schedule.cron('0 3 * * *', 'America/Sao_Paulo')),
      Effect.orDie, // only CronParseError left; a bad expression should crash at once
      Effect.forkScoped,
    );
  }),
).pipe(Layer.provide(Sweeper.layer));
```

## 6. Mounting better-auth under /api/auth/*

Register a wildcard raw route on the router: method `"*"` matches all methods and `PathInput` is `` `/${string}` | "*" `` routed by find-my-way, so `/api/auth/*` works (`effect/dist/http/HttpRouter.d.ts:34,357,718`). Convert the Effect request to a web `Request`, call `auth.handler`, convert the web `Response` back. Handle every error inside the handler so the route's error channel stays `never` and nothing leaks into `HttpRouter.serve`'s types.

```ts
import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { auth } from './auth.js'; // better-auth instance

export const AuthRoutes = HttpRouter.use((router) =>
  router.add('*', '/api/auth/*', (request) =>
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
  ),
);

// then: HttpRouter.serve(Layer.mergeAll(ApiRoutes, AuthRoutes, ...))
```

## 7. Testing with @effect/vitest

`it.effect("name", () => Effect.gen(...))` runs a test with test services (TestClock — import from `effect/testing`); `it.live` uses real services; `it.effect.each`/`.prop` exist (`@effect/vitest/dist/index.d.ts:198,206,289`; `effect/ai-docs/src/09_testing/10_effect-tests.ts`). For shared layers, the top-level `layer(L, options?)("name", (it) => ...)` builds `L` once for the whole block and tears it down in `afterAll`; the scoped `it` it hands you also has `it.layer(...)` for nesting, plus a `memoMap` option to share builds across blocks (`@effect/vitest/dist/index.d.ts:139-155,257`; `effect/ai-docs/src/09_testing/20_layer-tests.ts`). Per-test provision is just `Effect.provide(MyService.layerTest)` at the end of the pipe. For HttpApi handlers there is also `HttpApiTest.groups(Api, ["users"])` — an in-memory typed client, no server (`effect/dist/http-api/HttpApiTest.d.ts:34`; `effect/ai-docs/src/51_http-server/20_testing.ts`).

```ts
import { assert, it, layer } from '@effect/vitest';
import { Effect } from 'effect';

layer(UserRepo.layerTest)('UserRepo', (it) => {
  it.effect('finds a user', () =>
    Effect.gen(function* () {
      const repo = yield* UserRepo;
      const user = yield* repo.findById('u1');
      assert.strictEqual(user.id, 'u1');
    }),
  );
  // layer is SHARED across tests in this block — state persists between them
});
```

## 8. ManagedRuntime: calling Effect from NestJS during the transition

`ManagedRuntime.make(layer, { memoMap? })` builds the layer once and gives you `runPromise` / `runSync` / `runFork` / `runPromiseExit` to execute Effects from plain async code; `dispose(): Promise<void>` tears down the layer scope (closing the pg Pool from item 3) (`effect/dist/ManagedRuntime.d.ts:166,188,276`). Create one app-wide runtime from the composition root, call it inside Nest controllers/services, and dispose it in the shutdown hook; `Layer.makeMemoMapUnsafe()` (`effect/dist/Layer.d.ts:345`) lets multiple runtimes share memoized layers if you ever need more than one (`effect/ai-docs/src/04_integration/10_managed-runtime.ts`).

```ts
import { ManagedRuntime } from 'effect';
import { AppLayer } from './app-layer.js';

export const runtime = ManagedRuntime.make(AppLayer);

// in a NestJS controller:
// const user = await runtime.runPromise(UserRepo.use((repo) => repo.findById(id)))

// in onApplicationShutdown / enableShutdownHooks:
// await runtime.dispose()
```

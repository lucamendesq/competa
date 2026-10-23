# Strip Nest — STATE

Branch: `strip-nest`. Read this first on every invocation; update after every commit.

## Phase 0 — foundations

| Step                                                        | Status |
| ----------------------------------------------------------- | ------ |
| Branch `strip-nest`                                         | done   |
| codebase-map (dependency edges below)                       | done   |
| effect + @effect/platform + @effect/platform-node installed | done   |
| `docs/strip-nest/effect-v4-notes.md` (research)             | done   |
| Test infra (vitest + swc, boot helper, test DB, smoke spec) | done   |
| Pre-commit (typecheck + api tests)                          | done   |
| STATE.md                                                    | done   |

## Test infra

- `apps/api/vitest.config.ts` — swc transform (decorator metadata), serial files, env overrides (`NODE_ENV=test`, `DB_NAME=competa_test`, `LOG_LEVEL=error`).
- `apps/api/test/support/boot.ts` — `bootApp()` boots the real app (`src/app.ts#createApp`, extracted from `main.ts`) on an ephemeral port. Characterization suites import ONLY this + fetch; the helper is reimplemented over Effect in the final phase.
- `apps/api/test/support/db.ts` — `truncateAll()` truncates all public tables.
- Test DB: `competa_test` in the `apps/api/docker-compose.yml` postgres (init script creates it). Migrate with `DB_NAME=competa_test pnpm db:migrate`.
- Wire contract (frozen): success `{ data }` / `{ data, meta }` (ResponseInterceptor), errors `{ error: { code, message, details? } }` (AppErrorFilter).
- Run: `pnpm --filter api test` (or `pnpm test` from `apps/api`).

## Effect v4 — armadilhas principais (detalhe em effect-v4-notes.md)

- `@effect/platform` foi REMOVIDO das deps: o 0.97.x é linha v3. Em v4, HTTP vive em `effect/http` / `effect/http-api` (core) + `@effect/platform-node`.
- `Layer.scoped` não existe; `Layer.effect` constrói no scope da layer (`Effect.acquireRelease` direto dentro — padrão para o pg Pool).
- `HttpServerRequest.toWeb` (Effect) / `HttpServerResponse.fromWeb` (sync) + `HttpRouter.add('*', '/api/auth/*', handler)` = receita do mount do better-auth.
- `Schedule.cron('0 3 * * *', tz?)` tem `CronParseError` no canal de erro — `orDie`.
- `Effect.fork`/`forkDaemon` viraram `forkChild`/`forkScoped`/`forkDetach`.
- Testes: `@effect/vitest` com `layer(L)(...)` no topo e `it.layer` aninhado; `HttpApiTest.groups` para handlers sem servidor.

## Module table

Order: smallest first; auth last (better-auth plumbing is replaced in the final phase).

| #   | Module     | Tests commit | Migration commit | Unit tests | Status          |
| --- | ---------- | ------------ | ---------------- | ---------- | --------------- |
| 1   | periods    | 893d2c9      | 8c9a352          | 9 specs    | done            |
| 2   | contacts   | —            | —                | —          | tests in flight |
| 3   | companies  | —            | —                | —          | tests in flight |
| 4   | checklists | —            | —                | —          | tests in flight |
| 5   | requests   | —            | —                | —          | pending         |
| 6   | messaging  | —            | —                | —          | pending         |
| 7   | whatsapp   | —            | —                | —          | pending         |
| 8   | billing    | —            | —                | —          | pending         |
| 9   | auth       | —            | —                | —          | pending         |

## Dependency map (from codebase-map, 2026-10-23)

Edges are "depends on". **DI** = NestJS module/provider edge (serializes migration); **pure** = plain import of functions/types (no DI); **type** = types/decorators only.

- billing → auth (DI)
- companies → auth (DI), contacts (DI)
- contacts → auth (DI), messaging (DI), periods (DI), requests (DI)
- checklists → auth (type only)
- messaging → requests (DI), whatsapp (DI), auth (pure/type)
- periods → checklists (DI), auth (pure/type), requests (pure: `review-rules`)
- requests → auth (type; `upload.module.ts` provides `UploadTokenGuard` whose file lives in `modules/auth/`), messaging (pure: `reminder-rules`)
- whatsapp → auth (DI), messaging (pure/type: provider base class)
- app shell → auth (APP_GUARDs: TenantGuard, PlanGuard; plus ThrottlerGuard)

No true DI cycles. File-level cycles are caused by 5 misplaced files only: `contact.guard.ts`, `contact-upload.guard.ts`, `upload-token.guard.ts` live in `modules/auth/` but belong to contacts/upload modules; `MockWhatsappProvider`/`WhatsappProvider` live in `modules/messaging/providers/` but are provided by WhatsappModule.

Safe parallel pairs (no DI path): periods ∥ companies, periods ∥ billing, periods ∥ whatsapp, checklists ∥ billing, checklists ∥ whatsapp, requests ∥ billing, companies ∥ billing, companies ∥ whatsapp.

Cross-module seams the Effect composition must reproduce: event contract in `src/lib/events.ts` (all listeners in `modules/messaging/`); `setMagicLinkSender`/`setResetPasswordSender` runtime hooks (`infra/auth/magic-link-sender.ts`, wired in `messaging.module.ts` onModuleInit). Crons: `requests/deadline.cron.ts` (7h, America/Sao_Paulo), `requests/reminders.cron.ts` (9h).

## Found bugs (log only — fix in follow-ups, never mid-migration)

1. `GET /periods/:id/requests?page=abc` → 500 INTERNAL_ERROR. `periods.controller.ts` chama `PaginationQuery.parse(rawQuery)` cru (fora do `zodPipe`), o `ZodError` não casa com nenhum branch do `AppErrorFilter` e cai no fallback 500. Deveria ser 422. Congelado em `test/periods.e2e.spec.ts` ("bug congelado"). Obs: o branch `'rows' in result` no controller é código morto (`listRequests` com query sempre devolve `{rows,total}`).

## Migration pattern (set by periods — follow for every module)

- Effect service `<Module>Repo` in `src/modules/<module>/<name>.repo.ts`: `const make = Effect.gen(...)` returning the methods, `class XRepo extends Context.Service<XRepo, Effect.Success<typeof make>>()('competa/api/<module>/XRepo')` with `layerNoDeps = Layer.effect(XRepo, make)` and `layer = layerNoDeps.pipe(Layer.provide(Db.layer))`.
- `Db` service (`src/infra/database/effect.ts`) wraps the infra drizzle instance; `db.use(f)` → `Effect<A, DbError>`; `db.raw` only for constructing not-yet-migrated plain repository classes.
- Old Nest `@Injectable` repository becomes a thin shim delegating to `run(XRepo.use(...))` — keeps controllers and cross-module DI intact until consumers migrate.
- `src/effect/runtime.ts`: composition root `AppLayer` (add each migrated service with `Layer.mergeAll` + one `provideMerge(Db.layer)` at the root), `ManagedRuntime`, and `run()` which unwraps `DbError` → cause so `AppErrorFilter` sees raw driver errors. Runtime disposal intentionally unwired while `Db.layer` owns no resources.
- Errors thrown inside `db.use` arrive wrapped as `DbError`; remap to typed fails with `catchTag('DbError', ...)` where business errors (AppError subclasses) are involved (see `openWithFanOut`, `closePeriod`).
- Unit tests in `test/unit/<name>.repo.spec.ts` via `@effect/vitest` `layer(XRepo.layer)(...)`; seed direto no banco; `toFirmScope`/`toContactScope` permitidos lá via bloco no `apps/api/eslint.config.mjs` (`test/unit/**`). Exceções de lint SEMPRE em bloco de config (lint-staged roda com a config da raiz — diretivas inline somem no `--fix`).

## Session notes

- The working tree carries the user's uncommitted WIP (apps/web files + `apps/api/src/config/logger.ts`, `modules/auth/invite.repository.ts`, `modules/companies/companies.controller.ts`, `modules/messaging/providers/log-email.provider.ts` — invite re-send semantics changed). NEVER stage these. If the WIP is discarded later, re-check characterization suites for auth/companies/messaging.
- `pnpm-lock.yaml` contains both the user's prior changes and the strip-nest dep additions; committing it is required and acceptable.

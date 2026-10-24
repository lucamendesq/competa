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

| #   | Module     | Tests commit | Migration commit | Unit tests | Status                |
| --- | ---------- | ------------ | ---------------- | ---------- | --------------------- |
| 1   | periods    | 893d2c9      | 8c9a352          | 9 specs    | done                  |
| 2   | contacts   | 88688ab      | b6d3f52          | 6 specs    | done                  |
| 3   | companies  | 3d24db1      | 92e47e5          | 12 specs   | done                  |
| 4   | checklists | 34a7bfc      | fa59e11          | 23 specs   | done                  |
| 5   | requests   | 3b53657      | 14c49f8          | 41 specs   | done                  |
| 6   | messaging  | c3680ce      | —                | —          | tests done (33 specs) |
| 7   | whatsapp   | 8c8ce40      | b9f617d          | 6 specs    | done                  |
| 8   | billing    | 0c57b3b      | b9f617d          | 5 specs    | done                  |
| 9   | auth       | 3bc9cd4      | final phase      | —          | tests done (44 specs) |

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
2. `PATCH /companies/:id` com `{}` → 500. `UpdateCompanyBody` é todo parcial, `{}` passa no zodPipe e o drizzle lança `No values to set`. Deveria ser 422. Congelado em `test/companies.e2e.spec.ts`.
3. `PATCH /companies/:id/contacts/:contactId` com `{}` → 500. Mesma causa (ContactBody.partial()). Congelado em `test/companies.e2e.spec.ts`.
4. `POST /companies/import/confirm` valida `responsibleAccountantId` (422 para id de outra firma) mas `insertBatch` nunca grava a coluna — empresa importada fica com `responsibleAccountantId: null`. Congelado em `test/companies.e2e.spec.ts`.
5. (não congelado — inalcançável via HTTP hoje) `revokeAccess` apaga a row de `user` quando o último vínculo de contato cai, sem checar se o user também é accountant.
6. Override `add` parcial sobre tipo que já está no template transforma item ANUAL em MENSAL com `dueMonthOffset` 1: os defaults do zod (`periodicity:'monthly'`, `dueMonthOffset:1`, `required:true`) são gravados non-null e derrotam o `??` de herança no `mergeEffectiveChecklist` — cujo próprio comentário diz existir para impedir exatamente isso. Só `annualMonth`/`dueDay`/`conditionFlag` herdam de fato. Congelado em `test/checklists.e2e.spec.ts`.
7. (quirk, não bug) DELETE de template é bloqueado por empresa INATIVA (TEMPLATE_IN_USE) enquanto `companyCount` na listagem mostra 0 — FK-correto, display enganoso.
8. `POST /my/documents` com `requestId` não-uuid → 500: `ContactUploadGuard` passa o body cru para `findUploadOwnership` antes do zodPipe e o Postgres estoura (`invalid input syntax for type uuid`). Deveria ser 422. Congelado em `test/contacts.e2e.spec.ts`.
9. Ativação passwordless cria a conta better-auth com senha ALEATÓRIA via `signUpEmail` → todo Responsável nasce com credencial: o perfil mostra `hasPassword: true` para quem nunca escolheu senha e `POST /my/password` responde sempre 400 PASSWORD_ALREADY_SET (caminho 204 inalcançável) — o Responsável fica preso ao magic link. Congelado em `test/contacts.e2e.spec.ts`.
10. `POST /whatsapp/test` sem integração ativa → 500 (`throw new Error('Integração não ativa')` cru no controller; deveria ser 4xx tipado). Congelado em `test/whatsapp.e2e.spec.ts`.
11. (segurança) `WHATSAPP_ENCRYPTION_KEY` ausente → `WhatsappCryptoService` usa chave fallback toda-zero conhecida (`'0'.repeat(64)`); tokens cifrados com ela são decifráveis por qualquer um. Em produção o env é obrigatório? NÃO está em REQUIRED_IN_PRODUCTION. Congelado em `test/whatsapp.e2e.spec.ts`.
12. (quirks congelados em `test/whatsapp.e2e.spec.ts`) onboard é stub (ignora `body.code`, grava credenciais mock mesmo sem META env); test send não grava linha em `message` (sem rastreio de entrega); `/whatsapp/test` não é owner-gated (onboard/disconnect são); DELETE idempotente devolve `{success:true}` sem integração.
13. `POST /requests/:id/upload-link/resend` SEMPRE responde 503 — e o email já saiu com link MORTO: `onUploadLinkResent` não devolve o boolean que o `emitAsync(...).includes(true)` do controller espera, então `applyUploadToken` nunca roda (o token novo não é gravado) mas a entrega foi feita e logada como `resend/sent`. Congelado em `test/messaging.e2e.spec.ts`.
14. Reenvio (`POST /messages/:id/resend`) de mensagem whatsapp sai por EMAIL: `resend()` chama `deliver()` sem `channel` e cai no provider default. Congelado em `test/messaging.e2e.spec.ts`.
15. (quirks congelados em `test/messaging.e2e.spec.ts`) resend não checa status (mensagem `sent` duplica à vontade); row `purpose=resend` não tem branch → `{sent:false}` silencioso; resend push sem inscrição devolve `{sent:false}` ANTES do 409 de request fechada; `/messages/failures` com periodId alheio/desconhecido devolve `[]` e não 404.
16. Rejeitar documento promete `linkRotated: true` mas o token antigo sobrevive 48h de graça — o docstring de `rotateLinkOnReopen` diz "mata o token anterior NA HORA / zerar previous_token_hash" e o código grava `previousTokenHash: current.tokenHash`. Congelado em `test/requests.e2e.spec.ts`.
17. `POST /documents/:id/review-extra` ignora encerramento: `reviewExtraRefusal` recebe `requestStatus` e nunca o checa — Extra continua revisável com a Solicitação fechada (itens e documentos de item bloqueiam). Congelado em `test/requests.e2e.spec.ts`.
18. (quirks congelados em `test/requests.e2e.spec.ts`) review-extra unitário com `accepted` + `rejectionReason` grava a reason (o lote anula); checklist só de itens opcionais nunca chega a `complete` (`allAccepted` exige required não-vazio); comentário obsoleto em `request.repository.ts` fala em 422 para o race de reject — é 409.
19. `POST /billing/checkout` é write → firma OVERDUE/CANCELED/trial-expirado leva 402 PAYMENT_REQUIRED na PRÓPRIA rota que regularizaria o pagamento (em prod, firma inadimplente não se auto-recupera pelo checkout). Congelado em `test/billing.e2e.spec.ts`.
20. (quirks congelados em `test/billing.e2e.spec.ts`) `startCheckout` é UPDATE sem upsert — firma sem linha de subscription recebe 201 e nada persiste; checkout nunca toca `status` (plano/ciclo mudam na intenção, ativação só via webhook); LogBilling devolve `checkoutUrl: ''`.
21. (segurança) Header `x-internal-signup` é forjável: qualquer cliente que o envie atravessa o hook do better-auth e cria conta órfã com sessão viva, sem convite — a conta leva 403 nas rotas de tenant mas ocupa o email para sempre (`/auth/register` passa a responder SIGNUP_REJECTED). Congelado em `test/auth.e2e.spec.ts`.
22. Branch 409 morto em `POST /auth/sign-up`: email convidado que ganhou conta entre convite e aceite → better-auth com `asResponse: true` devolve o erro como Response, o adapter embrulha como sucesso com `userId: ''` e o insert de accountant estoura no Postgres (`invalid input syntax for type uuid: ""`) → 500 em vez do 409 EMAIL_ALREADY_REGISTERED que o controller pretende. Rollback preserva o convite. Congelado em `test/auth.e2e.spec.ts`.
23. (quirk congelado em `test/auth.e2e.spec.ts`) `PATCH /auth/device` com `installed` omitido RESETA installed para false no upsert (default do zod vence a semântica de patch).

## Migration pattern (set by periods — follow for every module)

- Effect service `<Module>Repo` in `src/modules/<module>/<name>.repo.ts`: `const make = Effect.gen(...)` returning the methods, `class XRepo extends Context.Service<XRepo, Effect.Success<typeof make>>()('competa/api/<module>/XRepo')` with `layerNoDeps = Layer.effect(XRepo, make)` and `layer = layerNoDeps.pipe(Layer.provide(Db.layer))`.
- `Db` service (`src/infra/database/effect.ts`) wraps the infra drizzle instance; `db.use(f)` → `Effect<A, DbError>`; `db.raw` only for constructing not-yet-migrated plain repository classes.
- Old Nest `@Injectable` repository becomes a thin shim delegating to `run(XRepo.use(...))` — keeps controllers and cross-module DI intact until consumers migrate.
- `src/effect/runtime.ts`: composition root `AppLayer` — serviços independentes entram por `Layer.mergeAll`; serviço que é DEPENDÊNCIA de outro (ex.: ChecklistsRepo ← PeriodsRepo) entra por `Layer.provideMerge` ANTES do `provideMerge(Db.layer)` final (mergeAll não alimenta um layer com outro). Memoização por referência garante instância única. `ManagedRuntime` + `run()` que desembrulha `DbError` → cause para o `AppErrorFilter` ver erros crus. Disposal do runtime fica para a fase final (Db.layer não possui recursos). Cada repo com dependência: `layer = layerNoDeps.pipe(Layer.provide(DepRepo.layerNoDeps), Layer.provide(Db.layer))` para os testes de unidade.
- Errors thrown inside `db.use` arrive wrapped as `DbError`; remap to typed fails with `catchTag('DbError', ...)` where business errors (AppError subclasses) are involved (see `openWithFanOut`, `closePeriod`).
- Unit tests in `test/unit/<name>.repo.spec.ts` via `@effect/vitest` `layer(XRepo.layer)(...)`; seed direto no banco; `toFirmScope`/`toContactScope` permitidos lá via bloco no `apps/api/eslint.config.mjs` (`test/unit/**`). Exceções de lint SEMPRE em bloco de config (lint-staged roda com a config da raiz — diretivas inline somem no `--fix`).

## Pending cleanups (fold into a dedicated commit, not into module commits)

- Hoist to `test/support/fixtures.ts`: `putFile` (3 cópias: contacts/requests/messaging), `rawRequest`+`cookieOf` (contacts/whatsapp/requests/billing/auth), `registerMember`/`addMember` (whatsapp/billing/auth), `openFirmWithCompanies` (contacts/messaging/requests variantes). As suites de auth já aterrissaram — pode fazer.
- `type Executor` (`Omit<Db['Service']['raw'], '$client'>`) está duplicado em 4 repos (companies/checklists/requests×2) com o mesmo comentário — hoist para `src/infra/database/effect.ts`.
- **Registro órfão de `MessageProvider`**: depois da migração de messaging, o token Nest `MessageProvider` (`messaging.module.ts`) perdeu o último injetor — o Nest ainda o CONSTRÓI no boot (segundo `new Resend(...)` em produção) e o log de boot do MessagingModule passa a mentir. Deletar junto com o seam de providers.
- **Cópias mortas e DIVERGENTES de `reminderCandidates`/`reminderSettingsByFirm`**: existem em `message.repo.ts` E `request.repo.ts`. Só as do `RequestsRepo` têm chamador (`reminders.cron.ts`). As duas divergem: a de requests aplica o gate da capability `reminderTuning` + `DEFAULT_REMINDER_SETTINGS`, a de messaging devolve as colunas cruas — e o spec de unidade de messaging hoje CONGELA o comportamento sem gate ("devolve os knobs crus"), cimentando um bypass de plano como se fosse intencional. Apagar as duas de messaging + os 4 specs correspondentes.
- **Seam de providers de messaging** (mesma forma do Storage): `MessagesRepo` constrói email/push/whatsapp dentro do `make`. O provider whatsapp de PRODUÇÃO só entra por `await import()` memoizado porque o import estático fecha um ciclo ESM (`runtime → message.repo → providers/whatsapp.provider → whatsapp.repository (shim) → runtime`) que quebra qualquer módulo que importe `message.repo.ts` direto. O ciclo só some quando `whatsapp.provider.ts` parar de depender do shim — resolver junto com o seam. Esse branch de produção não tem cobertura (é inalcançável hoje por causa do bug #14).
- **Storage seam**: `DocumentsRepo` constrói o próprio provider (`env.NODE_ENV === 'production' ? new R2Storage() : new LocalStorage()`), duplicando a expressão do `storage.module.ts`. Em produção isso significa DOIS `S3Client` (o outro vem do `zip.controller.ts` via DI) e o log de boot do StorageModule passa a mentir. Criar um `Storage` `Context.Service` espelhando o padrão do `Db` (~10 linhas) resolve: instância única, expressão em um lugar só, e devolve o seam que o `verify-com-67-25.ts` teste 3 usava (bloco removido no commit da migração de requests — restaurar junto). Fazer antes da fase final.

## Known flakes (observar; não bloqueiam)

- `checklists.e2e.spec.ts > GET /document-types` já falhou 1x com 500 vindo do `registerFirm` (fixtures.ts). Limpo no re-run. `fileParallelism: false`, então não é contenção entre arquivos — suspeita: listener fire-and-forget de uma suite anterior ainda escrevendo quando a próxima roda `truncateAll()`+seed, ou pool não drenado no `app.close()`. Se reaparecer, instrumentar o `beforeAll` (aguardar quiesce do pool antes de truncar).

## Session notes

- The working tree carries the user's uncommitted WIP (apps/web files + `apps/api/src/config/logger.ts`, `modules/auth/invite.repository.ts`, `modules/companies/companies.controller.ts`, `modules/messaging/providers/log-email.provider.ts` — invite re-send semantics changed). NEVER stage these. If the WIP is discarded later, re-check characterization suites for auth/companies/messaging.
- `pnpm-lock.yaml` contains both the user's prior changes and the strip-nest dep additions; committing it is required and acceptable.

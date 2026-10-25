# Strip Nest — STATE

Branch: `strip-nest`. Read this first on every invocation; update after every commit.

## Phase 0 — foundations

| Step                                                        | Status |
| ----------------------------------------------------------- | ------ |
| Branch `strip-nest`                                         | done   |
| codebase-map (dependency edges below)                       | done   |
| effect + @effect/platform + @effect/platform-node installed | done   |
| `docs/strip-nest/effect-v4-notes.md` (research)             | done   |
| Test infra (vitest, boot helper, test DB, smoke spec)       | done   |
| Pre-commit (typecheck + api tests)                          | done   |
| STATE.md                                                    | done   |

## Test infra

- `apps/api/vitest.config.ts` — serial files, env overrides (`NODE_ENV=test`, `DB_NAME=competa_test`, `LOG_LEVEL=error`). O transform swc (metadata de decorator) saiu na F7: sem decorators, o esbuild do vitest basta — a suíte inteira roda em ~51s com ou sem ele.
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
| 6   | messaging  | c3680ce      | 56884dc          | 25 specs   | done                  |
| 7   | whatsapp   | 8c8ce40      | b9f617d          | 6 specs    | done                  |
| 8   | billing    | 0c57b3b      | b9f617d          | 5 specs    | done                  |
| 9   | auth       | 3bc9cd4      | final phase      | —          | tests done (44 specs) |

## Fase final — o strip (em andamento)

Todos os 9 repositórios estão em Effect; o que resta é a CASCA. Sub-fases (cada uma verificada pela suíte de caracterização, que é a rede):

1. **Plataforma**: servidor `effect/http` (core v4, NÃO `@effect/platform`), envelope de resposta, mapa de erros (equivalente ao `AppErrorFilter`), origin-check, helmet, CORS, throttling, mount do better-auth, paridade do `test/support/boot.ts`.
2. **Guards → middleware Effect**: TenantGuard (sessão → FirmScope), PlanGuard, ContactGuard, ContactUploadGuard, UploadTokenGuard. Os escopos branded continuam nascendo só aqui.
3. **Rotas por módulo** (97 handlers / 23 controllers — baseline em `route-inventory.md`), cada lote verificado contra a suíte do módulo.
4. **Crons** `@nestjs/schedule` → `Schedule.cron` + `forkScoped` (ver effect-v4-notes.md §5). **FEITA** (F5): `src/modules/requests/crons.ts` — `cronsLayer({deadlines, reminders})` entra no `Layer.mergeAll` do `ManagedRuntime` de `createApp`. As CLASSES `DeadlineCron`/`RemindersCron` continuam do container Nest (só os decorators `@Cron`/`@SentryCron` saíram); o que saiu do Nest foi o agendamento. `ScheduleModule.forRoot()` removido do `app.module.ts` — `@nestjs/schedule` não tem mais nenhum import em `src/`.
5. **Mount do better-auth** direto no router Effect — **FEITO**: `src/http/auth-mount.ts` (`HttpRouter.add('*', '/api/auth/*')` → `HttpServerRequest.toWeb` → `auth.handler` → `HttpServerResponse.fromWeb`). Prova A/B contra o mount Nest (segundo `http.Server` ligado ao express do container): status, TODOS os headers, cada linha de `Set-Cookie` e corpo idênticos em sign-up (com e sem `x-internal-signup`), sign-in, magic-link verify, get-session, sign-out (3 cookies), 404 sob `/api/auth`, path base e preflight. `HttpServerResponse.fromWeb` **preserva** múltiplos `Set-Cookie` como linhas separadas e mantém o percent-encoding do valor (`Cookies.fromSetCookie` guarda o `valueEncoded`) — não foi preciso escrever no `ServerResponse` cru.
6. **Ponte estranguladora removida** (`src/http/nest-bridge.ts` deletado) — **FEITO**: `src/http/fallback.ts` é o curinga `'*' '/*'` que roda a pilha global (helmet → origin-check → CORS → log) e, se ninguém respondeu, devolve o 404 `{"error":{"code":"NOT_FOUND",…}}` com ETag e `charset=utf-8` (byte a byte igual ao do `AppErrorFilter`). **Decisão da colisão `OPTIONS /*` × catch-all (design §4/§5): não existe rota `OPTIONS` separada.** find-my-way recusa método duplicado no mesmo padrão (`Method 'OPTIONS' already declared for route '/*'`), e o preflight nunca foi outra coisa além do `cors()` global, que encerra a resposta antes de qualquer roteamento. O curinga reproduz isso de graça.
7. **Remoção das deps** `@nestjs/*`, `rxjs`, `reflect-metadata`, `@thallesp/nestjs-better-auth` — **FEITA (F7)**. Detalhe abaixo.
8. `test-quality-audit` + `create-pr` único da branch.

### F7 — o Nest saiu

`grep -rE "@nestjs|from 'rxjs'" apps/api/src` vazio; nenhum `@nestjs/*` em `apps/api/package.json`. Suíte inalterada: 27 arquivos / 566 testes, verde em duas execuções sequenciais.

**Apagado**: `app.module.ts`, os 23 `*.controller.ts`, os 11 `*.module.ts`, os 5 guards (`tenant`/`plan`/`session`/`contact`/`contact-upload`), `upload-token.guard.ts` (o erro `InvalidUploadLink` foi para `modules/auth/errors.ts`), `upload-throttler.guard.ts`, os 9 decorators de `modules/auth/`, `lib/app-error.filter.ts`, `lib/response.interceptor.ts` (o `paginated`/`ENVELOPED` foi para `http/envelope.ts`), `lib/origin-check.ts` (o gêmeo Express), `zip-flight.service.ts`, `database.module.ts`, `storage.module.ts`, `upload-link.repository.ts` (sem consumidor), `nest-cli.json`, e o `zodPipe` de `lib/zod-pipe.ts` (`zodParse` fica).

**Cada consumidor de DI que sobrou**:

| Antes (container Nest)                                             | Agora                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EventEmitter2` (`EventEmitterModule.forRoot`)                     | `new EventEmitter2()` em `createApp` (uma por app) — `eventemitter2` é dep direta. Interop CJS em `src/lib/event-emitter.ts`                                                               |
| `CollectionEventsListener` / `RequestCreatedListener` (`@OnEvent`) | `src/modules/messaging/listeners.ts` → `registerMessagingListeners(events)`, com o mesmo `try/catch` do `EventSubscribersLoader` (erro vira log, não rejeição) e a mesma ORDEM de registro |
| `MessagingModule.onModuleInit` (magic link / reset)                | mesmo `registerMessagingListeners`                                                                                                                                                         |
| `HealthRepository`                                                 | `src/health.ts` — `ping()` sobre o `Db` do runtime Effect                                                                                                                                  |
| `DeadlineCron` / `RemindersCron`                                   | `new DeadlineCron(...)` / `new RemindersCron(...)` em `createApp`                                                                                                                          |
| `StorageProvider` (`StorageModule`)                                | `src/infra/storage/storage.ts` — singleton de módulo                                                                                                                                       |
| `MessageProvider` / `PushProvider`                                 | `src/modules/messaging/providers/providers.ts` — singletons de módulo                                                                                                                      |
| `Logger` (`nestjs-pino`)                                           | `src/lib/logger.ts` — mesma superfície, um único `pinoHttp(...)` por processo (raiz + middleware de requisição)                                                                            |
| `BetterAuthModule.forRoot` (mount morto)                           | apagado com o pacote                                                                                                                                                                       |

**Pending cleanups fechados aqui**: seam de Storage (3 cópias da expressão → 1; fim dos dois `S3Client` em produção), seam de providers de messaging (2 cópias → 1; fim do segundo `new Resend()`), registro órfão de `MessageProvider` (morreu com `messaging.module.ts`), `type Executor` hoisted para `src/infra/database/effect.ts`.

**Não fechados** (seguem como dívida): o ciclo ESM `runtime → message.repo → whatsapp.provider → whatsapp.repository → runtime` — o `await import()` memoizado continua em `providers.ts`, porque tirar o ciclo exige `WhatsappProvider` sem `run()`, o que é uma layer de providers de verdade e não cabia na remoção de deps; o `inFlight` global do zip (inofensivo: chaves são UUID); e as cópias mortas de `reminderCandidates`/`reminderSettingsByFirm` em `message.repo.ts` (apagá-las muda a contagem da suíte, que esta sub-fase tinha de manter).

Gate de paridade: diff da lista de rotas antes/depois contra `docs/strip-nest/route-inventory.md` (97 handlers + `/api/auth/*`).

Design completo em [`platform-design.md`](./platform-design.md) — recomendação central: **`HttpRouter` (handler-first), não `HttpApi`**, porque `HttpApi` exige Effect Schema e converter os 97 schemas zod de `@competa/contracts` seria um segundo projeto (além de não expressar stream, mount wildcard nem envelope uniforme). O zod fica onde está.

### Decisões das 6 questões abertas do design (§12) — resolvidas pela regra dura 6 (comportamento congelado)

1. Headers `X-RateLimit-*`: **manter** em toda resposta (paridade).
2. helmet: **chamar o pacote** pelos objetos node crus (paridade; nenhum spec assere os headers, mas trocar seria mudança de comportamento).
3. `eventemitter2` como dep direta: **sim**; NÃO trocar por `PubSub` do Effect nesta branch — mudaria a semântica do `emitAsync` e quebraria o bug congelado #13.
4. `ContactUploadGuard` lendo o corpo antes da validação: **preservar** (é o bug congelado #8).
5. IP do cliente em produção: **replicar `trust proxy: 1`**. Trocar para `fly-client-ip` é mais seguro, mas é mudança de comportamento → follow-up separado, não nesta branch.
6. `zip.controller.ts` / `setErrorHandler`: **não decidível no papel.** Tentar paridade primeiro; `requests.e2e.spec.ts:1419` prova que a chave do single-flight libera no close do stream, não no retorno do handler. Se a paridade não sair, ESCALAR ao usuário em vez de escolher um comportamento novo.
   → **RESOLVIDA no lote D (F4f).** A paridade saiu inteira para tudo que a suíte prende: a chave do voo único sai no `close` do `ZipArchive` (`archive.once('close'|'error', release)`, mesmo evento que o `ZipFlightService` usava) e o abort do cliente continua em `res.on('close')` sobre o `ServerResponse` de `NodeHttpServerRequest.toServerResponse`. Sobra só o rabo do `setErrorHandler` (divergência 2 abaixo), fora do alcance da suíte.

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

- **`docs/conventions.md` está podre, e não foi este ramo que o apodreceu.** Ele declara
  **Angular** no frontend (o `apps/web` é Vue há muito) e NestJS no backend. O `AGENTS.md` já foi
  corrigido para Effect neste ramo; o `conventions.md` precisa de uma passada própria, porque
  arrumar só a metade de backend deixaria a de frontend mentindo. `AGENTS.md:55` aponta para ele
  como "lista completa de anti-patterns", então não dá para abandonar.

- Hoist to `test/support/fixtures.ts`: `putFile` (3 cópias: contacts/requests/messaging), `rawRequest`+`cookieOf` (contacts/whatsapp/requests/billing/auth), `registerMember`/`addMember` (whatsapp/billing/auth), `openFirmWithCompanies` (contacts/messaging/requests variantes). As suites de auth já aterrissaram — pode fazer.
- `type Executor` (`Omit<Db['Service']['raw'], '$client'>`) está duplicado em 4 repos (companies/checklists/requests×2) com o mesmo comentário — hoist para `src/infra/database/effect.ts`.
- **Registro órfão de `MessageProvider`**: depois da migração de messaging, o token Nest `MessageProvider` (`messaging.module.ts`) perdeu o último injetor — o Nest ainda o CONSTRÓI no boot (segundo `new Resend(...)` em produção) e o log de boot do MessagingModule passa a mentir. Deletar junto com o seam de providers.
- **Cópias mortas e DIVERGENTES de `reminderCandidates`/`reminderSettingsByFirm`**: existem em `message.repo.ts` E `request.repo.ts`. Só as do `RequestsRepo` têm chamador (`reminders.cron.ts`). As duas divergem: a de requests aplica o gate da capability `reminderTuning` + `DEFAULT_REMINDER_SETTINGS`, a de messaging devolve as colunas cruas — e o spec de unidade de messaging hoje CONGELA o comportamento sem gate ("devolve os knobs crus"), cimentando um bypass de plano como se fosse intencional. Apagar as duas de messaging + os 4 specs correspondentes.
- **Seam de providers de messaging** (mesma forma do Storage): `MessagesRepo` constrói email/push/whatsapp dentro do `make`. O provider whatsapp de PRODUÇÃO só entra por `await import()` memoizado porque o import estático fecha um ciclo ESM (`runtime → message.repo → providers/whatsapp.provider → whatsapp.repository (shim) → runtime`) que quebra qualquer módulo que importe `message.repo.ts` direto. O ciclo só some quando `whatsapp.provider.ts` parar de depender do shim — resolver junto com o seam. Esse branch de produção não tem cobertura (é inalcançável hoje por causa do bug #14).
- **`inFlight` do zip é global de módulo** (`zip.routes.ts`), onde o `ZipFlightService` era `@Injectable()` por container. Mesma forma do problema que levou o `ThrottleStore` a virar `Context.Reference` por app — mas aqui a chave é UUID de request/period, então duas apps no mesmo processo nunca colidem e não há 409 falso. `runtime.dispose()` não limpa o Set. Virar referência por app junto com o seam de Storage.
- **Storage seam**: `DocumentsRepo` constrói o próprio provider (`env.NODE_ENV === 'production' ? new R2Storage() : new LocalStorage()`), duplicando a expressão do `storage.module.ts`. Em produção isso significa DOIS `S3Client` (o outro vem do `zip.controller.ts` via DI) e o log de boot do StorageModule passa a mentir. Criar um `Storage` `Context.Service` espelhando o padrão do `Db` (~10 linhas) resolve: instância única, expressão em um lugar só, e devolve o seam que o `verify-com-67-25.ts` teste 3 usava (bloco removido no commit da migração de requests — restaurar junto). Fazer antes da fase final.

## Fase final — divergências (conhecidas e aceitas)

1. **Webhooks e content-type (Asaas e WhatsApp).** O `express.json()` só parseava `application/json`; com outro content-type `req.body` ficava `{}` e, no WhatsApp, o `rawBody` nem era preenchido (HMAC falhava fechado). No shell Effect o corpo é lido independentemente do content-type. Dois efeitos, ambos ANTES da checagem de segredo/HMAC: corpo não-JSON passa a dar 400 em vez de 503/403, e JSON enviado sob content-type errado passa a ser processado onde o Nest ignorava. Não afrouxa nada — o HMAC/token continua sendo o portão de todo efeito — e é inalcançável na suíte (o 503 por `META_APP_SECRET`/`ASAAS_WEBHOOK_TOKEN` ausentes dispara antes do segredo ser comparado). Reproduzir o `type-is` do Express seria projeto próprio. Migrado no lote A.

2. **Erro NO MEIO do stream do zip (`StreamableFile.setErrorHandler`).** Quando uma leitura
   do storage falha com o zip já em transmissão, o Nest chamava o `setErrorHandler`:
   `archive.destroy()` + `response.end()` — resposta encerrada limpa, com um zip truncado
   que o cliente vê como completo. Em `effect/http` não existe equivalente (probe do §11 do
   design): o `Stream.orDie` do `NodeHttpServer` cai no `handleCause`, que com `headersSent`
   **destrói o socket** em vez de `end()` (o comentário do próprio pacote: "ending a started
   response normally would make a partial body look complete").

   O ramo `if (!response.headersSent) response.statusCode = 500` do handler antigo **era
   alcançável no Nest**, ao contrário do que esta nota dizia antes: o `express-adapter` usa
   `setHeader` (não `writeHead`), então `headersSent` só vira true no primeiro chunk — um
   `error` do archiver antes do primeiro byte (ex.: `openRead` falhando na primeira entrada)
   virava 500. No shell Effect o `HttpServerResponse.stream` escreve os headers antes, então
   esse ramo é estruturalmente inalcançável.

   Diferença observável, portanto: onde o Nest respondia 500 (erro antes do primeiro byte)
   ou 200-truncado (erro no meio), o Effect aborta a conexão. Nenhum spec alcança — exige o
   storage falhar durante um download. É a troca de um zip truncado que PARECE completo por
   uma falha visível, o que é mais seguro, mas é mudança de comportamento e está aqui por
   isso. `archive.destroy()` continua acontecendo, pelo `lazyRead`. Migrado no lote D.

3. **Varredura que falha não derruba mais o processo.** O `@Cron` do `@nestjs/schedule` não
   trata o retorno: `daily()`/`scheduled()` rejeitando virava unhandled rejection (e, no
   default do node, queda do processo). No agendamento Effect o `Effect.catchCause` loga
   (`cron <slug> falhou`) e o `Schedule.cron` continua de pé para o dia seguinte. Nenhum
   spec alcança — exige o Postgres cair durante a varredura. É estritamente mais seguro,
   mas é mudança de comportamento. Migrado na F5.

4. **`Sentry.withMonitor` só embrulha a execução AGENDADA.** O `@SentryCron` embrulhava o
   MÉTODO, então `runDeadlineSweep()` (handle de `createApp`, usado por
   `requests.e2e.spec.ts:1707,1726`) também mandava check-in. Agora o monitor vive no
   agendamento (`crons.ts`), como o design §7 pede. Invisível na suíte (o Sentry não é
   inicializado em teste — `instrument.ts` só é importado por `main.ts`) e em produção
   `runDeadlineSweep` não tem chamador. `POST /deadlines/scan` e
   `POST /messages/reminders/run` chamam `scan`/`run`, que nunca tiveram monitor.

5. **O teto de 2 MB passou a valer para qualquer content-type.** O `express.json({limit:'2mb'})`
   do `BetterAuthModule.forRoot` só media corpo `application/json`; o
   `HttpIncomingMessage.MaxBodySize` do shell mede todo corpo que uma rota leia
   (`request.text`/`arrayBuffer`). É a mesma raiz da divergência 1 (o Express decidia por
   `type-is`, o shell lê o corpo e pronto). Não afrouxa nada — antes desta sub-fase o shell
   Effect estava SEM limite algum, que é o lado perigoso. `/api/auth/*` (corpo em stream) e
   `PUT /storage/local/:key` (lê o `IncomingMessage` cru) seguem fora do teto, exatamente
   como o `SkipBodyParsingMiddleware` os deixava de fora.

6. **Logs de boot do Nest sumiram** (F7). As ~300 linhas de `InstanceLoader`/`RoutesResolver` por
   restart deixaram de existir junto com o container — o hook `BOOT_CONTEXTS` de
   `src/config/logger.ts` (WIP do usuário) virou código morto inofensivo e foi PRESERVADO
   intacto. Os banners de escolha de provider continuam, com contexto novo: `[Storage]`,
   `[MessageProviders]` (eram `[StorageModule]`, `[MessagingModule]`, `[WhatsappModule]`,
   `[BillingModule]`). `[Bootstrap]` substitui o logger do Nest na linha de porta do `main.ts`.

7. **`eventemitter2` precisa de interop explícito** (F7). O `.d.ts` do pacote declara
   `export default` num CJS cujo `module.exports` É a classe: sob `nodenext` o import nomeado
   typechecka e roda no vitest, mas `node dist/main.js` quebra com
   "does not provide an export named 'EventEmitter2'". `src/lib/event-emitter.ts` é a tradução
   (o `@nestjs/event-emitter` tinha um arquivo só para isso). **Lição: o gate de `pnpm build` +
   bootar o `dist` pega o que a suíte não pega** — o vitest resolve interop CJS que o loader ESM
   do node não resolve.

8. **`pnpm build` deixou de ser incremental** (F7). `nest build` apagava o `outDir`; `tsc -p`
   sozinho reusava o `tsconfig.build.tsbuildinfo` e emitia um `dist` PARCIAL depois de um
   `rm -rf dist` (foi assim que o primeiro boot do `dist` falhou com MODULE_NOT_FOUND). O script
   passou a ser `rm -rf dist && tsc -p tsconfig.build.json && tsc-alias …` com
   `"incremental": false` no `tsconfig.build.json`.

9. **Scripts de verificação apagados** (F7): `verify-com-148.ts` e `verify-com-150.ts` instanciavam
   `InviteController`/`TeamController`/`AsaasWebhookController` direto. O que eles provavam está
   coberto por `auth.e2e.spec.ts` e `billing.e2e.spec.ts` sobre HTTP real. `verify-plan-gates.ts`
   (ligado em `pnpm check:plan-gates`) sobreviveu: o bloco do `PlanGuard` virou uma chamada a
   `planAllows` + `PlanCapabilityRequired`, o mesmo teste que `resolveFirm` faz em
   `src/http/middleware/auth.ts`. Os outros 5 shims `*.repository.ts` que só os scripts usam
   (checklist/company/contact/period/subscription) ficaram, sem `@Injectable`.

10. **Repositório virou interrompível (onda 3 do endurecimento).** O `fromRuntime` rodava todo
    repositório numa fibra destacada, fora do alcance de qualquer interrupção. Agora eles correm
    na fibra da requisição, então um abort do cliente no meio de uma transação dispara o
    finalizador do `Db.withTransaction` e **desfaz** onde antes commitava. É o desfecho correto e
    foi pedido pela onda, mas é mudança de comportamento. **Sem teste**: provocar um abort no
    instante certo de uma transação real é acoplado a tempo e flakaria; o rollback em si já está
    coberto pelos testes de `withTransaction`. Aceita conscientemente.

## Endurecimento Effect (pós-strip) — plano em `effect-hardening.md`

| Onda | O que                                                                            | Estado      |
| ---- | -------------------------------------------------------------------------------- | ----------- |
| 1    | Transação ambiente (`CurrentTransaction` + `withTransaction`)                    | `3fd532b`   |
| 2    | Fim das cascas: 5 shims órfãos, chamadores não-Effect, `withDb` morto            | `7a8452f`   |
| 3    | Um runtime só: `fromRuntime` apagado, `appServices` na layer do servidor         | `9978d1a`   |
| 4    | Canal de erro: `use`/`withTransaction` matam, `attempt`/`attemptTransaction` não | `15e28d0`   |
| 5    | `Db.layerTest` como trava sem banco; repositórios seguem no Postgres real        | este commit |
| 6    | `ResendOutcome`: os 4 desfechos do reenvio saem do booleano                      | este commit |

A dívida que a onda 3 deixou (`DbError` na união `Failure` de `platform.ts`, no `Resolved` de
`middleware/auth.ts` e em `inviteToApp`) foi apagada pela onda 4.

Armadilha que a onda 4 deixa para quem mexer em transação: `withTransaction` mata o `DbError`,
então um corpo que use `db.attempt` e queira TRATAR o erro precisa de `db.attemptTransaction` —
os dois `DbError` (o do corpo e o da maquinaria) têm a mesma tag e o `withTransaction` mataria
ambos. Os 9 sítios que inspecionam já usam a variante certa.

Fronteiras promise que SOBRARAM e são legítimas: listeners do eventemitter2, entradas de cron,
scripts. A de `providers/whatsapp.provider.ts` NÃO é legítima — é o ciclo ESM já listado em
"Pending cleanups"; morre junto com o seam de providers.

O que a onda 5 deliberadamente NÃO fez: dublê in-memory de repositório. Os nossos são SQL
(escopo, joins, violação de unicidade) e um dublê apagaria a única cobertura do isolamento por
Contabilidade — regra dura 2. Os 13 specs de repositório continuam no Postgres real, de
propósito. `Db.layerTest` é trava, não dublê: satisfaz o tipo e mata qualquer consulta.

## Achados da F5 (já corrigidos, não são dívida)

- **`maxParamLength` do find-my-way (100) estava escondendo uma rota morta.** `PUT /storage/local/:storageKey`
  recebe a chave inteira percent-encoded (`firm/<uuid>/period/<aaaa-mm>/request/<uuid>/<uuid>.ext`,
  ~155 caracteres). O roteador Effect recusava o match desde o lote A e a ponte entregava o
  request ao `LocalStorageController` do Nest — ou seja, a rota migrada nunca tinha rodado e
  a suíte passava pelo caminho antigo. Deletar a ponte revelou isso (22 specs de
  contacts/messaging/requests em 404). Corrigido com `routerConfig: { maxParamLength: 1024 }`
  em `HttpRouter.serve` — o Express não tinha limite nenhum, então é paridade, não um
  afrouxamento. Lição para a sub-fase 7: qualquer rota com parâmetro longo (chave de
  storage, token) precisa de um spec que a ATINJA, não só de um 200 em algum lugar.

## Known flakes (observar; não bloqueiam)

- `auth-middleware.spec.ts` (+1 outro arquivo) falhou 1x na F7 com 29 testes em
  `SyntaxError: Unexpected token 'C', "Client sen"... is not valid JSON` — corpo de resposta que
  não é JSON. Não reproduziu em 5 execuções seguidas depois (incluindo a mesma sequência
  `vitest run test/unit` → `vitest run` que a provocou). A string não existe em `src/`, `test/`
  nem em `node_modules`. Se voltar, capturar o corpo cru antes do `JSON.parse` em
  `test/unit/http/auth-middleware.spec.ts:105`.
- `checklists.e2e.spec.ts > GET /document-types` já falhou 1x com 500 vindo do `registerFirm` (fixtures.ts). Limpo no re-run. `fileParallelism: false`, então não é contenção entre arquivos — suspeita: listener fire-and-forget de uma suite anterior ainda escrevendo quando a próxima roda `truncateAll()`+seed, ou pool não drenado no `app.close()`. Se reaparecer, instrumentar o `beforeAll` (aguardar quiesce do pool antes de truncar).

## Session notes

- The working tree carries the user's uncommitted WIP (apps/web files + `apps/api/src/config/logger.ts`, `modules/auth/invite.repository.ts`, `modules/companies/companies.controller.ts`, `modules/messaging/providers/log-email.provider.ts` — invite re-send semantics changed). NEVER stage these. If the WIP is discarded later, re-check characterization suites for auth/companies/messaging.
- `pnpm-lock.yaml` contains both the user's prior changes and the strip-nest dep additions; committing it is required and acceptable.

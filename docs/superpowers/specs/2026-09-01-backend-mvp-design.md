# SPEC — Backend MVP (Fases 1→7)

> **Data:** 2026-09-01 · **Escopo:** `apps/api` (NestJS) + `libs/contracts` · **Fora:** `apps/web`, `apps/mobile`, WhatsApp (Fase 8), push/FCM (Fase 9).
> Esta spec **complementa** os docs canônicos ([`product.md`](../../product.md), [`domain.md`](../../domain.md), [`database-schema.md`](../../database-schema.md), [`architecture.md`](../../architecture.md), [`conventions.md`](../../conventions.md)). Onde ela diverge deles, o §2 registra a divergência e o doc canônico **deve** ser atualizado na mesma mudança.

---

## 1. Objetivo

Entregar a API completa do MVP: uma Contabilidade cadastra Empresas e seus checklists, **abre a Competência**, o sistema cobra por email, o Responsável envia documentos por **link sem senha**, o Contador revisa, acompanha pendências e baixa o zip.

Critério de pronto: o ciclo inteiro roda ponta-a-ponta via HTTP, sem frontend.

---

## 2. Decisões desta spec (deltas sobre os docs canônicos)

| #    | Decisão                                                                                                                                                                                                | Supera / altera                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| D-01 | **N Contadores por Contabilidade**, via convite. O responsável pela firm convida; o convidado se cadastra pelo token.                                                                                  | `product.md` ("v1: único por tenant"), `domain.md`                           |
| D-02 | **Não existe signup aberto.** A Contabilidade é criada por script CLI (`create-firm`), não por rota HTTP nem rota de admin. Cobrança acontece fora do produto (concierge) até validar as hipóteses 🔴. | `roadmap.md` TASK-004 ("signup atômico")                                     |
| D-03 | Tabela **`invite`** (nova) serve os dois casos: convidar Contador (`accounting_firm_id`) e convidar Responsável para o App (`company_id`). Exatamente uma origem por convite.                          | `database-schema.md` (tabela nova)                                           |
| D-04 | **`contact.auth_user_id` é nullable** — login do Responsável é opcional (existe só para push/App). O fluxo de upload nunca exige conta.                                                                | confirma `database-schema.md`; encerra a ambiguidade com o requisito de push |
| D-05 | Renomes no código existente: `accounting` → `accounting_firm`; `representative` → `contact` (com `auth_user_id` nullable).                                                                             | alinha código ao glossário normativo                                         |
| D-06 | **Sem Nx.** pnpm workspace puro; `libs/contracts` é um pacote pnpm comum.                                                                                                                              | `architecture.md`, `conventions.md`, `decisions.md` D10                      |
| D-07 | Coluna `public_id` (nanoid) é **removida** de todas as tabelas — nenhum consumidor; o Link de Upload tem token próprio.                                                                                | código existente (`shared-schemas.ts`)                                       |
| D-08 | Cron com **`@nestjs/schedule`** (não `node-cron`).                                                                                                                                                     | confirma `architecture.md`                                                   |
| D-09 | Envelope de resposta e formato de erro definidos no §4 e §5.                                                                                                                                           | fecha os `{a definir}` de `conventions.md` §API                              |
| D-10 | Layout mantém `src/infra/` (já existente) como camada de adaptadores; `src/database/` dos docs = `src/infra/database/`. Arquivos em kebab-case.                                                        | ajusta `architecture.md` §apps/api                                           |

---

## 3. Padrões transversais (obrigatórios)

1. **`Result<S, F>` (Either) para todo caminho de falha esperada.** Use case retorna `PromiseResult<T, AppError>`; nunca lança para erro de negócio. `throw` fica para bug/infra.
2. **DI por classe abstrata.** Toda dependência trocável é uma `abstract class` no módulo de domínio, com a implementação em `src/infra/` registrada por `{ provide: X, useClass: Y }`. Já vale para `Database` e `AuthProvider`; passa a valer para `StorageProvider`, `EmailProvider`, `Clock`.
3. **Drizzle em sintaxe SQL-like.** `db.select().from(t).where(and(eq(...), isNull(...)))` e `sql` template para o que não couber. Sem `db.query.*`.
4. **Validação só por `libs/contracts`.** Um schema zod por recurso, consumido pelo `zodPipe` da API e (depois) pelos forms do Angular.
5. **Camada sob demanda.** CRUD simples: controller → repositório. Use case só onde há regra (fan-out, revisão, importação, zip, convite, upload).
6. **Um repositório por módulo**, com `FirmScope`/`UploadScope` na assinatura (§6).

---

## 4. Estrutura de resposta padrão

Envelope aplicado por um `ResponseInterceptor` global — o controller devolve o payload cru.

```jsonc
// recurso
{ "data": { "id": "…", "name": "Padaria do João" } }

// coleção paginada
{
  "data": [ … ],
  "meta": { "page": 1, "perPage": 20, "total": 137 }
}
```

- Paginação por query: `?page=1&perPage=20`. Default `perPage=20`, máximo `100`. Schema `PaginationQuery` em `libs/contracts`.
- `204 No Content` não recebe envelope.
- Download de zip e URLs pré-assinadas são exceções explícitas (stream binário / payload próprio documentado no endpoint).
- `/api/auth/*` (rotas do Better Auth) são exceção explícita: middleware da lib, fora do `ResponseInterceptor`, resposta no formato próprio do Better Auth (em inglês).

---

## 5. Estrutura de erro padrão

```jsonc
{
  "error": {
    "code": "INVITE_EXPIRED",
    "message": "Este convite expirou. Peça um novo ao seu contador.",
    "details": { "expiresAt": "2026-08-20T12:00:00Z" },
  },
}
```

**`src/lib/app-error.ts`:**

```ts
export abstract class AppError extends Error {
  abstract readonly code: string; // SCREAMING_SNAKE, estável, consumido pelo cliente
  abstract readonly status: number; // HTTP
  readonly details?: unknown;
}
```

- Cada módulo declara suas subclasses em `<modulo>/errors.ts` (`InviteExpired`, `PeriodAlreadyOpen`, `UploadLinkRevoked`, …). Uma classe por causa — nada de `AppError` genérico com string solta.
- `message` é **PT-BR e exibível ao usuário final**; `details` é para o cliente, nunca carrega stack trace, SQL ou dado de outro tenant.
- Controller: `if (isFailure(result)) throw result.error;`
- `AppErrorFilter` (global, 1 arquivo) serializa `AppError`. `HttpException` do Nest e erro desconhecido caem em `INTERNAL_ERROR` (500) com `message` genérica e log do original.
- `zodPipe` passa a lançar `ValidationError` (`code: "VALIDATION_ERROR"`, `status: 422`, `details` = `z.flattenError`).
- `/api/auth/*` (rotas do Better Auth) são exceção explícita: middleware da lib, fora do `AppErrorFilter`, erro no formato próprio do Better Auth (em inglês), não neste catálogo.

**Catálogo inicial de códigos** (cresce por módulo, sempre documentado aqui):

| code                                                                  | status          | quando                                                                                   |
| --------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                                                    | 422             | input reprovado pelo schema zod                                                          |
| `UNAUTHENTICATED`                                                     | 401             | sem sessão válida                                                                        |
| `FORBIDDEN`                                                           | 403             | sessão válida sem permissão / fora do escopo                                             |
| `NOT_FOUND`                                                           | 404             | recurso inexistente **ou de outro tenant** (nunca revelar a diferença)                   |
| `INVITE_NOT_FOUND` / `INVITE_EXPIRED` / `INVITE_ALREADY_ACCEPTED`     | 404 / 410 / 409 | fluxo de convite                                                                         |
| `INVITE_EMAIL_MISMATCH`                                               | 422             | signup com email diferente do convidado                                                  |
| `EMAIL_ALREADY_REGISTERED`                                            | 409             | signup com email existente                                                               |
| `COMPANY_WITHOUT_CONTACT_EMAIL`                                       | 422             | fan-out ou envio sem email                                                               |
| `PERIOD_ALREADY_OPEN`                                                 | 409             | competência já aberta para o mês                                                         |
| `PERIOD_CLOSED` / `REQUEST_CLOSED`                                    | 409             | operação em ciclo encerrado                                                              |
| `UPLOAD_LINK_INVALID` / `UPLOAD_LINK_EXPIRED` / `UPLOAD_LINK_REVOKED` | 404 / 410 / 410 | Link de Upload (mensagem genérica — não revela existência)                               |
| `FILE_TOO_LARGE` / `TOO_MANY_FILES` / `FORMAT_NOT_ACCEPTED`           | 422             | limites de upload                                                                        |
| `ITEM_NOT_REVIEWABLE`                                                 | 409             | transição de estado inválida do Item                                                     |
| `INVITE_TARGET_UNSUPPORTED`                                           | 501             | convite cujo destino (ex.: Empresa/`contact`) ainda não tem fluxo de aceite implementado |
| `INTERNAL_ERROR`                                                      | 500             | fallback                                                                                 |

---

## 6. Isolamento por tenant — `FirmScope` e `UploadScope`

`src/modules/auth/scope.ts`:

```ts
declare const brand: unique symbol;
export type FirmScope = string & { readonly [brand]: 'FirmScope' }; // accounting_firm_id
export type UploadScope = { requestId: string; contactId: string } & {
  readonly [brand]: 'UploadScope';
};
```

- Construídos **exclusivamente** pelos guards de `src/modules/auth/`. Nenhum outro arquivo pode fazer o cast — é bug de segurança (LGPD/sigilo), não estilo.
- `AuthGuard` valida a sessão Better Auth → `TenantGuard` resolve `accountant.accounting_firm_id` → `@CurrentScope()` injeta `FirmScope`.
- `UploadTokenGuard` valida `token_hash` + `expires_at` + `revoked` → injeta `UploadScope`. **Fora do Better Auth**, sem sessão, sem cookie.
- **Todo método de repositório recebe o escopo como 1º parâmetro.** Query sem escopo não compila.
- Recurso de outro tenant responde `NOT_FOUND`, nunca `FORBIDDEN` (não vaza existência).

**Invariante do fluxo público (regra nº3 do AGENTS.md):** rotas com `UploadTokenGuard` expõem nome/descrição/formatos/prazo/status dos Itens e aceitam upload. **Nunca** listam, leem ou baixam conteúdo de `document`.

---

## 7. Estrutura de pastas

```
libs/contracts/                     # pacote pnpm @contabilidade/contracts (zod puro, sem deps de runtime)
  src/{index,pagination,auth,company,contact,checklist,period,request,upload}.ts

apps/api/src/
  main.ts  app.module.ts
  config/env.ts                     # zod (cresce com R2/Resend)
  lib/                              # either.ts · app-error.ts · app-error.filter.ts
                                    #   response.interceptor.ts · zod-pipe.ts · clock.ts
  infra/
    auth/                           # better-auth.ts + better-auth.adapter.ts
    database/
      schema/                       # 1 arquivo por contexto, re-exportados por schema/index.ts
        auth.ts registry.ts collection.ts messaging.ts relations.ts
      database.ts database.module.ts index.ts
    storage/r2.storage.ts           # implementa StorageProvider
    email/resend.email.ts           # implementa EmailProvider
  modules/
    auth/                           # guards, scope, convites, signup por token, /me
    companies/                      # company, contact, importação de planilha
    checklists/                     # document_type, template(+item), override, checklist efetivo
    periods/                        # abrir/encerrar competência, fan-out, painel de pendências
    requests/                       # request, item, document, upload público, revisão, zip
    messaging/                      # message, EmailProvider, listeners, reminders.cron.ts
  scripts/create-firm.ts            # provisionamento manual (D-02)
```

Arquivos em **kebab-case** (`open-period.usecase.ts`, `sign-up.usecase.ts`) — o `SignUpUseCase.ts` atual é renomeado.

---

## 8. Schema — deltas sobre `database-schema.md`

Tudo o que já está no doc canônico vale como escrito. Alterações:

**8.1 Renomes:** `accounting` → `accounting_firm`; `representative` → `contact`.

**8.2 `contact`** (substitui `representative`) — conforme o doc canônico, com `auth_user_id text unique` **nullable** (D-04) e `email not null` (invariante: sem email não há Solicitação).

**8.3 `accountant`** — ganha N por firm (D-01); mantém `auth_user_id` unique.

**8.4 `invite` (tabela nova):**

```sql
create table invite (
  id                  uuid primary key,          -- uuidv7 gerado na aplicação (§8.7)
  token_hash          text not null unique,     -- nunca o token em claro
  accounting_firm_id  uuid references accounting_firm(id) on delete cascade,
  company_id          uuid references company(id) on delete cascade,
  email               text not null,            -- para quem o convite foi emitido
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint invite_has_one_origin check (num_nonnulls(accounting_firm_id, company_id) = 1)
);
```

> O `invite.token` atual guarda o token em claro — passa a guardar **hash**, igual ao `upload_link` (mesmo helper `token.ts`: gera 32 bytes, devolve claro + hash, persiste só o hash).

**8.5 `document`** — ganha `upload_status text not null default 'pending' check (upload_status in ('pending','stored'))`, porque o upload é direto ao R2 em duas etapas (§9.5). Só documentos `stored` contam para o status do Item e entram no zip.

**8.6 Colunas compartilhadas** — `created_at`/`updated_at` como já existem; `public_id` removido (D-07); `deleted_at` só onde há soft delete real (`invite`); Empresa usa `company.active` conforme o doc.

**8.7 IDs** — mantém `uuidv7()` gerado na aplicação (já em uso) em vez de `gen_random_uuid()`; ordenação temporal de graça. Vale para **todas** as tabelas, inclusive as já escritas em `database-schema.md` com `default gen_random_uuid()` — registrar a mudança no doc canônico.

---

## 9. Superfície da API

Todas as rotas abaixo de `/` exigem `AuthGuard + TenantGuard`, exceto as marcadas **(pública)**.

### 9.1 auth

| Método | Rota                                  | Notas                                                                                                                                   |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| —      | `/api/auth/*`                         | Better Auth: login, logout, sessão                                                                                                      |
| GET    | `/invites/:token` **(pública)**       | preview: nome da Contabilidade/Empresa, email do convite, validade                                                                      |
| POST   | `/auth/sign-up?token=…` **(pública)** | aceita convite → cria `user` + (`accountant` \| `contact.auth_user_id`) em transação; compensa deletando o `user` se a transação falhar |
| POST   | `/invites`                            | Contador convida Contador (`email`) → dispara email                                                                                     |
| POST   | `/companies/:id/invites`              | convida Responsável para o App (opcional)                                                                                               |
| GET    | `/me`                                 | contador + firm do escopo                                                                                                               |

### 9.2 checklists

| Método                | Rota                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| GET                   | `/document-types` (seed do produto + da firm)                         |
| POST · PATCH · DELETE | `/document-types[/:id]` (só os da firm)                               |
| GET                   | `/checklist-templates` (fixos + derivados)                            |
| GET                   | `/checklist-templates/:id`                                            |
| POST                  | `/checklist-templates/:id/derive` → cópia editável com `derived_from` |
| PATCH · DELETE        | `/checklist-templates/:id` (só derivados)                             |
| POST · PATCH · DELETE | `/checklist-templates/:id/items[/:itemId]`                            |

### 9.3 companies

| Método                | Rota                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| GET · POST            | `/companies` (filtros `?active=&q=`)                                               |
| GET · PATCH           | `/companies/:id`                                                                   |
| DELETE                | `/companies/:id` → `active = false`                                                |
| POST                  | `/companies/import` (CSV/XLSX) → `{ imported, failed: [{ line, code, message }] }` |
| POST · PATCH · DELETE | `/companies/:id/contacts[/:contactId]`                                             |
| GET · PUT             | `/companies/:id/checklist-overrides`                                               |
| GET                   | `/companies/:id/effective-checklist` (consulta canônica única)                     |

### 9.4 periods

| Método | Rota                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/periods`                                                                                                                             |
| POST   | `/periods` `{ referenceMonth, dueDate? }` → cria + **fan-out**; responde `{ period, requestsCreated, skipped: [{ companyId, code }] }` |
| GET    | `/periods/:id` (resumo com contadores por status)                                                                                      |
| GET    | `/periods/:id/pending` — Painel "quem faltou" (por Empresa: itens pendentes, enviados, aceitos, mensagens falhadas)                    |
| POST   | `/periods/:id/close`                                                                                                                   |
| GET    | `/periods/:id/zip`                                                                                                                     |

### 9.5 requests, revisão e upload público

| Método | Rota                                                  | Notas                                                                                                                                                              |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/requests?periodId=&status=&companyId=`              |                                                                                                                                                                    |
| GET    | `/requests/:id`                                       | itens + documentos `stored`                                                                                                                                        |
| POST   | `/request-items/:id/accept`                           | revisão **em lote**: aceita todos os documentos do Item; Item → `accepted`                                                                                         |
| POST   | `/request-items/:id/reject` `{ reason }`              | Item → `rejected` → reabre para `pending`; emite `ItemReopened` (reenvio SÓ por email)                                                                             |
| POST   | `/requests/:id/close`                                 | palavra final do Contador; pode fechar com pendências                                                                                                              |
| POST   | `/requests/:id/resend-link`                           | reenvio manual por email                                                                                                                                           |
| GET    | `/requests/:id/zip`                                   | streaming R2 → `archiver`; layout `empresa/competencia/item/arquivo`                                                                                               |
| GET    | `/u/:token` **(pública)**                             | dados da Solicitação e dos Itens — **nunca** documentos                                                                                                            |
| POST   | `/u/:token/uploads` **(pública)**                     | `[{ requestItemId?, fileName, contentType, sizeBytes }]` → valida formato/limites, insere `document` (`pending`) e devolve `{ documentId, uploadUrl }` por arquivo |
| POST   | `/u/:token/uploads/:documentId/confirm` **(pública)** | `document → stored`; `request_item → submitted`                                                                                                                    |

Limites: 100 MB por arquivo, 500 arquivos por envio; `.zip` aceito **sem extração**. `request.status = 'closed'` → só Documento Extra (`request_item_id IS NULL`).

---

## 10. Eventos (`@nestjs/event-emitter`, síncrono)

| Evento             | Emitido por                       | Consumido por                               |
| ------------------ | --------------------------------- | ------------------------------------------- |
| `PeriodOpened`     | periods                           | messaging (log)                             |
| `RequestCreated`   | periods (fan-out)                 | messaging → envia Link de Upload por email  |
| `ItemReopened`     | requests (rejeição)               | messaging → reenvia link **só por email**   |
| `RequestCompleted` | requests (todos os itens aceitos) | messaging (notifica Contador)               |
| `DeadlineMissed`   | messaging (cron)                  | messaging → notifica Responsável + Contador |
| `MessageFailed`    | messaging (provider)              | visível no Painel de Pendências             |
| `InviteCreated`    | auth                              | messaging → email do convite                |

Direção: registry → collection → messaging. Sem fila, sem outbox, sem CQRS.

---

## 11. Integrações externas

| Porta (abstract class)                                  | Implementação                                        | Onde                                                              |
| ------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `StorageProvider` — `presignPut`, `getStream`, `delete` | R2 via `@aws-sdk/client-s3` + `s3-request-presigner` | `infra/storage/`                                                  |
| `EmailProvider` — `send({ to, subject, html })`         | Resend                                               | `infra/email/`                                                    |
| `AuthProvider`                                          | Better Auth (já existe)                              | `infra/auth/`                                                     |
| `Clock` — `now()`                                       | `SystemClock`                                        | `lib/clock.ts` — testar prazos sem congelar o relógio do processo |

- Falha de canal **nunca** bloqueia o fluxo: `message.status = 'failed'` + `MessageFailed`; a Solicitação segue de pé.
- Cron (`@nestjs/schedule`): lembretes agrupados por Solicitação (**máx. 2**, contados em `message` por `purpose='reminder'`) e varredura diária de `due_date` estourado.
- `storage_key`: `{accounting_firm_id}/{period}/{company_id}/{document_id}/{file_name}`.

---

## 12. Provisionamento (D-02)

`pnpm --filter api create-firm --name "Contabilidade X" --email contador@x.com.br`

Numa transação: cria `accounting_firm` + `invite` (origem = firm). Imprime o link de convite no stdout, para você enviar manualmente. **Sem rota, sem role de admin, sem tela.** Signup aberto e billing entram só depois de ~10 escritórios pagantes validarem a hipótese 🔴 nº1 de `product.md`.

---

## 13. Invariantes que o código deve proteger

1. Nenhuma query sem `FirmScope`/`UploadScope` (garantido por tipo).
2. Rotas de `UploadTokenGuard` nunca listam nem baixam conteúdo de documento.
3. `request_item` é **snapshot congelado** na abertura — alterar template depois não afeta Solicitação aberta.
4. `unique (accounting_firm_id, reference_month)` e `unique (period_id, company_id)`.
5. Empresa sem `contact.email` não entra no fan-out — sai listada em `skipped`.
6. Encerrar Solicitação/Competência é ato **exclusivo** do Contador (jamais automático).
7. `request → complete` é automático quando todos os itens estão `accepted`.
8. Token (convite e upload) só persiste como hash.
9. Máximo 2 lembretes por Solicitação.
10. Erro de tenant errado responde `NOT_FOUND`.
11. Signup só aceita o email para o qual o convite foi emitido (`invite.email`) — convite não é transferível.

---

## 14. Fora de escopo

WhatsApp (Fase 8) · push/FCM e app mobile (Fase 9) · frontend Angular · billing e signup aberto (D-02) · extração de zip · parsing de XML de NF-e · RLS nativa no Postgres · testes automatizados (dispensados pelo dono do produto; as invariantes do §13 continuam sendo a lista de prioridade se/quando entrarem).

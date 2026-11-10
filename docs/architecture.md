# Arquitetura — Coleta de Documentos Contábeis

> Estado: projeto pré-código (2026-08-27) — arquitetura ALVO derivada da modelagem de domínio + decisões (ver [`decisions.md`](./decisions.md)).

## Visão Geral

**Monorepo pnpm workspaces** com dois apps:

- **`apps/web`** — **SPA React 19 (Vite, CSR, sem SSR)** servindo o painel do Contador, a página pública de upload e a área do Responsável. Consome a API por HTTP (`shared/lib/api-client.ts` com `credentials: 'include'`; uma pasta `api/` por feature). Padrão normativo em [`react-standards.md`](./react-standards.md).
- **`apps/api`** — **NestJS com TODO o backend**: REST em **feature modules** (companies, checklists, periods, requests, messaging), **Better Auth** montado na própria API, Postgres via Drizzle (provider no DI), documentos em Cloudflare R2 (upload direto por URL pré-assinada), **eventos síncronos entre módulos via `@nestjs/event-emitter`**, cron de lembretes via `@nestjs/schedule` e zip por streaming.

**`libs/contracts`** carrega os schemas zod compartilhados — os formulários do web (React Hook Form + `zodResolver`) validam com o mesmo schema da API. App mobile futuro (`apps/mobile`) consome a mesma API — framework em aberto (React Native vs Flutter).

Nada no produto exige SSR (painel autenticado; upload por token, sem SEO). **"Sem SSR" ≠ "sem servidor"**: token, URLs pré-assinadas, fan-out e mensageria vivem no Nest.

Controle de acesso por **um guard global** (`TenantGuard`), não por dois guards encadeados: ele resolve a sessão via `AuthProvider.getSession()` (abstract class, DI) e, a partir dela, o `FirmScope` (tipo branded que só `modules/auth/` constrói) — todo repositório o exige, tornando query sem tenant uma violação a ser pega em revisão/lint (não um erro de compilação real; ver [`conventions.md`](./conventions.md) para a regra de lint que audita isso). `@CurrentScope()`/`@Session()` expõem o resultado ao handler. O fluxo público de upload usa `UploadTokenGuard` (token do `upload_link`, escopo só-upload, fora do Better Auth).

## Estrutura do Monorepo

```
apps/
  web/          # React 19 SPA — SÓ frontend (painel, página pública de upload, área do Responsável)
  api/          # NestJS — TODO o backend (REST, auth, eventos, cron, zip, webhooks)
  mobile/       # futuro — framework a decidir (RN vs Flutter); consome a MESMA API
libs/
  contracts/    # schemas zod por recurso — validados no form (web) E no pipe (api)
```

**Sem CQRS, sem microservices** — só `@Module` + event-emitter síncrono.

### apps/web (React 19)

```
src/
  app/                 # router (React Router 7, rotas lazy), guards, shells (painel e Minha Área),
                       #   providers (TanStack Query, sessão, Toaster), uma rota = um módulo
  shared/              # sem domínio: components (ui/ = shadcn), lib (api-client, format, cn),
                       #   session, pwa (instalação, push), upload (useUpload, PUT no storage)
  features/
    auth/              # entrar, cadastro, senha, convite, Minha Área (acesso), "perdi meu link"
    catalog/           # tipos de documento e templates como opções (a única feature importável)
    companies/         # Empresas: lista, cadastro, checklist por Empresa, importação
    checklists/        # templates do produto e derivados
    periods/           # competências, Painel de Pendências, revisão da Solicitação
    messages/          # log de entrega
    firm/ team/ whatsapp/ billing/   # Configurações
    upload/            # página pública por token
    contact-area/      # área logada do Responsável
  testing/             # MSW, factories, test-utils e os fluxos críticos
```

Estado do servidor só no TanStack Query (key factory por feature); formulários com React Hook
Form + `zodResolver` sobre `libs/contracts`; imports na direção `shared → features → app`
(garantido pelo `eslint-plugin-boundaries`).

**Pastas e identificadores em inglês; as URLs e todo o texto de tela em PT-BR.** A rota
pública continua sendo `/envio/:token` e o painel `/empresas`, `/competencias` — o usuário
lê português, o código não.

### apps/api (NestJS — módulo por feature, camadas DENTRO)

```
src/
  main.ts  app.module.ts
  config/                    # env validado (zod)
  infra/
    auth/                    # montagem Better Auth (AuthProvider)
    database/
      schema/                # Drizzle — espelha docs/database-schema.md
      migrations/
      database.module.ts     # Drizzle como provider (injeção via DI)
  common/                    # ZodValidationPipe, exception filter, utils, VOs quando surgirem
  modules/
    auth/                    # TenantGuard (guard global único) + @CurrentScope()/@Session()
                             #   → injeta FirmScope (tipo branded) + UploadTokenGuard (upload público)
    companies/               # companies.module|controller|repository.ts (import CSV no repositório)
    checklists/              # checklist.repository.ts (derive/efetivo) + effective-checklist.ts (merge puro)
    periods/                 # period.repository.ts (fan-out + snapshot)
    requests/                # review-item, close-request, generate-zip, upload
    messaging/               # providers/ (email, whatsapp, push — 1 interface) + reminders.cron.ts
```

## Componentes Principais

| Componente                 | Responsabilidade                                                                             | Tecnologia                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| apps/web — painel          | Painel do Contador: cadastro, templates/overrides, competências, revisão em lote, pendências | React 19 + TanStack Query + React Hook Form + Tailwind/shadcn |
| apps/web — features/upload | Página pública de upload (token, multi-arquivo/zip, direto ao R2)                            | React (rota pública, lazy) + Tailwind mobile-first            |
| apps/api — modules/*       | Feature modules: controller → repository (FirmScope). Duas camadas, sem use case             | NestJS + Drizzle                                              |
| apps/api — modules/auth    | TenantGuard (guard global único) + UploadTokenGuard                                          | Better Auth (adapter Drizzle)                                 |
| apps/api — eventos         | `PeriodOpened`, `RequestCreated`, `ItemReopened`… entre módulos                              | `@nestjs/event-emitter` (síncrono)                            |
| apps/api — messaging       | Providers email/WhatsApp/push (1 interface) + `reminders.cron.ts`                            | `@nestjs/schedule`, ACL por provedor                          |
| libs/contracts             | Schemas zod por recurso, compartilhados web ↔ api (↔ mobile)                                 | zod                                                           |
| apps/mobile (futuro)       | App do Responsável: push + upload pela mesma API                                             | {a decidir: React Native vs Flutter}                          |
| Banco                      | Persistência multi-tenant (FirmScope na aplicação)                                           | Postgres + Drizzle (Supabase)                                 |
| Storage                    | Documentos e zips (egress grátis)                                                            | Cloudflare R2 (S3-compatible)                                 |

## Diagrama de Contexto

```
[Contador] ──► apps/web (React SPA, painel) ────┐
[Responsável] ─► apps/web (features/upload) ─────┤  HTTP/JSON (cookies; CORS restrito)
[Responsável] ─► apps/mobile (futuro, RN|Flutter)┤  contratos: libs/contracts (zod)
                                                 ▼
                                          apps/api (NestJS)
                           modules/auth/ (Better Auth + TenantGuard → FirmScope/UploadScope)
                           modules/ companies · checklists · periods · requests
                                │        eventos síncronos (@nestjs/event-emitter)
                                ▼                            ▼
                     Postgres (Drizzle)              modules/messaging/providers/
                     Cloudflare R2 ◄─ upload         SES/Resend │ WhatsApp Cloud API │ FCM
                     direto (URL pré-assinada)       @nestjs/schedule (cron lembretes)
```

## Bounded contexts → módulos Nest

| Context (conceito)             | Subdomínio | Módulos em `apps/api/src/modules/`                                                                     |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| **registry** (Cadastro)        | Supporting | `companies/` (empresa, responsável, importação) · `checklists/` (catálogo, templates, overrides)       |
| **collection** (Coleta — CORE) | Core       | `periods/` (competência, fan-out) · `requests/` (solicitação, itens, documentos, revisão, zip, upload) |
| **messaging** (Comunicação)    | Supporting | `messaging/` (mensagens, lembretes/cron, providers)                                                    |

Direção de dependência (convenção, não polícia): **registry → collection → messaging**, por eventos síncronos. Detalhe e invariantes em [`domain.md`](./domain.md).

## Integrações Externas

| Sistema            | Tipo                        | Protocolo     | Descrição                                                                      |
| ------------------ | --------------------------- | ------------- | ------------------------------------------------------------------------------ |
| Postgres           | Banco                       | Drizzle       | Persistência de tudo (inclusive tabelas Better Auth); Supabase, session pooler |
| WhatsApp Cloud API | Saída (+ webhook de status) | HTTP REST     | Link/lembretes com template utility aprovado; degrada para email               |
| SES ou Resend      | Saída                       | SDK/HTTP      | Email transacional; canal que nunca bloqueia o fluxo                           |
| FCM                | Saída                       | SDK           | Push para Responsável com App (futuro)                                         |
| Cloudflare R2      | Saída                       | S3-compatible | URLs pré-assinadas para upload direto; leitura em streaming para zip           |

> Better Auth não é interface externa — é biblioteca dentro de `apps/api`, com tabelas no nosso Postgres. R2 e Better Auth entram em modo **Conformist** (aceitar o modelo deles, wrapper mínimo); provedores de mensagem ficam atrás de **uma interface por canal** em `messaging/providers/` — payload da Meta/SES/FCM nunca vaza para os módulos de negócio.

## Schema do banco

Fonte canônica: [`database-schema.md`](./database-schema.md). Vive em `apps/api/src/infra/database/`; o schema Drizzle deve espelhar o documento.

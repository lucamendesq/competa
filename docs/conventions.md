# Convenções — Coleta de Documentos Contábeis

> Documento vivo. Atualizar conforme o projeto evolui. Padrões marcados `{a definir}` são decisões abertas — resolver na primeira feature que precisar.

## Stack canônica

TypeScript · **pnpm workspaces** · **Angular (SPA, CSR — sem SSR)** · **Tailwind CSS + Spartan UI** · **NestJS (todo o backend)** · Drizzle ORM · Postgres (host {a definir}) · **Better Auth** (na API) · Cloudflare R2 · `@nestjs/event-emitter` · zod (`libs/contracts`) · Mobile futuro {a decidir: React Native vs Flutter}.

## Nomenclatura

- **Identificadores em inglês** (código, banco, eventos); **PT-BR em docs, UI e dados exibidos**. O glossário PT↔EN em [`domain.md`](./domain.md#glossário-linguagem-ubíqua-pten) é **normativo** — só se usa o termo EN registrado (Solicitação → `request`, nunca `solicitation`).
- Proibidos em código: `client`, `user`, `month` soltos → `company`/`accounting_firm`, `accountant`/`contact`, `period`/`reference_month`. (Exceção: tabela `user` do Better Auth.)
- camelCase para variáveis/funções; PascalCase para tipos/componentes; kebab-case para arquivos, rotas e selectors Angular (`app-pending-panel`).
- Tabelas snake_case **singular** (`request_item`); estados como `text` + `check` constraint; eventos PascalCase verbo no passado (`DocumentRejected`).

## Frontend (Angular)

1. **Standalone components + signals**; Typed Reactive Forms nos formulários (templates/overrides/revisão), validando com os schemas de `libs/contracts` (os mesmos da API).
2. Componente **nunca** chama `HttpClient` direto — sempre via **service da feature** (ou `core/` quando global); 1 service por recurso.
3. Artefato usado por UMA feature vive nela; promove para `shared/` na **segunda** feature que usar — nunca preventivamente.
4. Route guards do Angular são **UX** (redirect sem sessão); a segurança real são os guards da API.
5. **Styling = Tailwind + Spartan UI:** utilities no template por padrão; componentes Spartan vivem em `shared/ui/` e são estilizados com Tailwind; arquivo de estilo por componente SÓ quando o estilo não for expressável em utilities (deve ser raro). **Angular Material está fora.**

## Backend (NestJS)

1. **Camada sob demanda:** use case só onde há lógica real (fan-out, revisão, importação, zip); CRUD simples → controller chama o repositório direto. Um repositório por módulo. Use case pass-through é anti-pattern.
2. **Sem `entities/` nem `vo/`:** o tipo da entidade é `typeof table.$inferSelect` do Drizzle; VO nasce em `common/` quando aparecer — não antes.
3. **Comunicação entre módulos = eventos síncronos via `@nestjs/event-emitter`** (nomes do mapa EN). Direção por convenção: companies/checklists → periods/requests → messaging. Sem fila/outbox na v1.
4. Provedores externos (SES/Resend, Meta, FCM) só atrás da interface em `modules/messaging/providers/`.
5. Organização **por feature**, nunca por camada (`controllers/`, `usecases/` no topo brigam com o sistema de Modules do Nest).

## Banco de dados

- **[`database-schema.md`](./database-schema.md) é canônico** — o schema Drizzle (`apps/api/src/infra/database/schema/`) deve espelhá-lo; divergência exige atualizar o doc na mesma PR.
- **Todo repositório exige `FirmScope` (ou `UploadScope`) como parâmetro** — tipos branded criados SÓ pelo `TenantGuard`/`UploadTokenGuard` em `modules/auth/`. Uma regra de lint (`no-restricted-imports`/`no-restricted-syntax` em `eslint.config.mjs`) audita que `Database` só é importado por repositório/guard/use case/script e que os construtores de escopo só são importados dentro de `modules/auth/`; contornar o tipo é **bug de segurança**, não de estilo.
- PK `uuid` gerado na aplicação (uuidv7, não `gen_random_uuid()` do Postgres); FKs com sufixo `_id`; estados como `text` + `check` (nunca enum nativo do Postgres); timestamps `timestamptz`, `created_at` default `now()` em toda tabela.

## API

- REST na API Nest; endpoints kebab-case, plural para coleções (`/companies`, `/periods/:id/close`).
- Validação de input: `ZodValidationPipe` com schemas de `libs/contracts` (mesmos do frontend).
- Autenticação: **Better Auth montado na API** (`/api/auth/*`) — pacote comunitário `@thallesp/nestjs-better-auth` com fallback manual documentado; sessão por cookie.
- **CORS/cookies entre origens** (`app.` ↔ `api.`): CORS restrito a `WEB_URL` com `credentials: true`; cookie domain compartilhado; `trustedOrigins` no Better Auth; no Angular, interceptor com `withCredentials: true`. Dev local: proxy do Angular (`proxy.conf.json`) evita CORS.
- **Fluxo público de upload:** rotas com `UploadTokenGuard` (token do `upload_link`, hash + expiração), escopo SÓ-upload — nunca sessão, nunca Better Auth.
- Upload de arquivos: direto ao R2 via URL pré-assinada (API só emite URLs e registra `document`); limites 100 MB/arquivo, 500/envio.
- Formato de erro e paginação: {a definir na primeira SPEC de API}.

## Testes

- API: {a definir — sugestão: Jest (default Nest)} · Web: {a definir — sugestão: Jest/Vitest + Playwright e2e}.
- Estratégia: priorizar as **invariantes do core** — escopo por tenant (FirmScope), escopo do link (nunca lista/baixa), transições de estado do Item, snapshot congelado na abertura, encerramento só pelo Contador, revisão em lote.

## Variáveis de ambiente

- `.env.example` na API (cresce a cada fase que adiciona integração); segredos nunca em código.
- **apps/api:** `DATABASE_URL` · `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` · `WEB_URL` (CORS/trustedOrigins) · `COOKIE_DOMAIN` · `PORT` · R2 (`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`) · Meta (`WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID`) · `RESEND_API_KEY` (ou SES) · FCM (service account).
- **apps/web:** `environment.ts` / `environment.prod.ts` com `apiUrl` (SPA não lê env em runtime; valores públicos apenas).

## Git

- Branches: {a definir — sugestão: `feature/*`, `fix/*`, `chore/*`}.
- Commits: {a definir — sugestão: Conventional Commits}.

## O que NÃO fazer (anti-patterns)

- Não usar `client`/`user`/`month` soltos em código, nem termo EN fora do glossário oficial.
- Não escrever query/repositório sem `FirmScope`/`UploadScope` — bug de segurança, não de estilo.
- Não manter dois sistemas de estilo: utilities Tailwind por padrão; `.scss`/`styles` de componente é exceção justificada, nunca o caminho normal; não introduzir Angular Material.
- Não colocar lógica de negócio no Angular — o web renderiza, valida forms com `libs/contracts` e chama services.
- Não chamar `HttpClient` fora de services; não validar input com schema fora de `libs/contracts`.
- Não chamar API da Meta/SES/FCM fora de `modules/messaging/providers/`.
- Não introduzir CQRS/microservices/fila na v1 — só `@Module` + event-emitter síncrono.
- Rotas do fluxo de upload NUNCA listam ou baixam conteúdo de documentos — só upload (nomes/status dos itens é permitido).
- Não expor documento a quem não é o Contador da Contabilidade dona ou o Responsável que enviou (LGPD).
- Não extrair zip no servidor nem parsear XML de NF na v1.
- Não criar pastas `entities/`/`vo/` nem use case pass-through — camada sob demanda.
- Não construir o que é Generic: auth (Better Auth), storage (R2), billing → integrar.
- Não divergir de `database-schema.md` sem atualizar o documento na mesma mudança.

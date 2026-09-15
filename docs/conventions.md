# Convenções — Coleta de Documentos Contábeis

> Documento vivo. Atualizar conforme o projeto evolui. Padrões marcados `{a definir}` são decisões abertas — resolver na primeira feature que precisar.

## Stack canônica

TypeScript · **pnpm workspaces** · **Angular (SPA, CSR — sem SSR)** · **Tailwind CSS + Spartan UI** · **NestJS (todo o backend)** · Drizzle ORM · Postgres (host {a definir}) · **Better Auth** (na API) · Cloudflare R2 · `@nestjs/event-emitter` · zod (`libs/contracts`) · Mobile futuro {a decidir: React Native vs Flutter}.

## Nomenclatura

- **Identificadores em inglês** (código, banco, eventos); **PT-BR em docs, UI e dados exibidos**. O glossário PT↔EN em [`domain.md`](./domain.md#glossário-linguagem-ubíqua-pten) é **normativo** — só se usa o termo EN registrado (Solicitação → `request`, nunca `solicitation`).
- Proibidos em código: `client`, `user`, `month` soltos → `company`/`accounting_firm`, `accountant`/`contact`, `period`/`reference_month`. (Exceção: tabela `user` do Better Auth.)
- camelCase para variáveis/funções; PascalCase para tipos/componentes; kebab-case para arquivos e selectors Angular (`app-pending-panel`).
- **A regra vale para pasta e nome de arquivo do `apps/web` também**: `features/companies/companies-list-page.ts`, nunca `features/empresas/`. O que fica em PT-BR é o **path da URL** (`/empresas`, `/competencias`, `/envio/:token`) e todo o texto de tela — é o que o usuário lê.
- Tabelas snake_case **singular** (`request_item`); estados como `text` + `check` constraint; eventos PascalCase verbo no passado (`DocumentRejected`).

## Frontend (Angular)

1. **Standalone components + signals**; Typed Reactive Forms nos formulários (templates/overrides/revisão), validando com os schemas de `libs/contracts` (os mesmos da API).
2. Componente **nunca** chama `HttpClient` direto — sempre via **service da feature** (ou `core/` quando global); 1 service por recurso.
3. Artefato usado por UMA feature vive nela; promove para `shared/` na **segunda** feature que usar — nunca preventivamente.
4. Route guards do Angular são **UX** (redirect sem sessão); a segurança real são os guards da API.
5. **Styling = Tailwind + Spartan UI:** utilities no template por padrão; componentes Spartan vivem em `shared/ui/` e são estilizados com Tailwind; arquivo de estilo por componente SÓ quando o estilo não for expressável em utilities (deve ser raro). **Angular Material está fora.**

## Backend (NestJS)

1. **Duas camadas: controller → repositório.** Um repositório por módulo; **não existe camada de use case** — o projeto é pequeno demais para pagar a indireção. O que seria use case (fan-out, revisão, importação, zip) é um **método do repositório**, transação inclusa. O controller fica com validação de entrada, checagens de escopo/estado e a tradução para HTTP. Lógica pura sem banco (merge de checklist, parser de CSV) vive em módulo solto no próprio feature module, testável direto.
2. **Sem `entities/` nem `vo/`:** o tipo da entidade é `typeof table.$inferSelect` do Drizzle; VO nasce em `common/` quando aparecer — não antes.
3. **Comunicação entre módulos = eventos síncronos via `@nestjs/event-emitter`** (nomes do mapa EN). Direção por convenção: companies/checklists → periods/requests → messaging. Sem fila/outbox na v1.
4. Provedores externos (SES/Resend, Meta, FCM) só atrás da interface em `modules/messaging/providers/`.
5. Organização **por feature**, nunca por camada (`controllers/`, `services/` no topo brigam com o sistema de Modules do Nest).

## Comentários

**O padrão é código sem comentário.** Nome de função, de variável e assinatura de tipo carregam o "o quê"; o "porquê" mora na mensagem de commit e nos `docs/`. Comentário é a última saída, não a primeira.

Escreva um comentário **só** quando o código não tem como dizer sozinho:

- bug, limitação ou comportamento surpreendente de biblioteca externa (com link/versão);
- workaround cuja remoção parece inofensiva e não é;
- invariante de segurança/atomicidade que um refactor inocente quebraria;
- `ponytail:` marcando um atalho deliberado e o gatilho para trocá-lo.

Nunca: comentário que repete a linha seguinte, cabeçalho decorativo de arquivo, JSDoc que só redigita o tipo, comentário de "seção", código comentado (o git guarda). Se o trecho precisa de explicação, primeiro tente renomear ou extrair uma função com nome melhor — na maioria das vezes resolve.

Diretivas (`eslint-disable-next-line`, `@ts-expect-error`) não são comentários — são instruções ao compilador/linter; use quando necessário, com o motivo na própria linha.

## Banco de dados

- **[`database-schema.md`](./database-schema.md) é canônico** — o schema Drizzle (`apps/api/src/infra/database/schema/`) deve espelhá-lo; divergência exige atualizar o doc na mesma PR.
- **Todo repositório exige `FirmScope`, `UploadScope` ou `ContactScope` como parâmetro** — tipos branded criados SÓ pelo `TenantGuard`/`UploadTokenGuard` em `modules/auth/`. Uma regra de lint (`no-restricted-imports`/`no-restricted-syntax` em `eslint.config.mjs`) audita que `Database` só é importado por repositório/guard/script, que os três construtores (`toFirmScope`/`toUploadScope`/`toContactScope`) só são importados dentro de `modules/auth/` e que nenhum dos três tipos é forjado com `as`; contornar o tipo é **bug de segurança**, não de estilo.
- PK `uuid` gerado na aplicação (uuidv7, não `gen_random_uuid()` do Postgres); FKs com sufixo `_id`; estados como `text` + `check` (nunca enum nativo do Postgres); timestamps `timestamptz`, `created_at` default `now()` em toda tabela.

### Credenciais de banco

- **Database:** `competa` — sem sufixo de ambiente; produção (Supabase) e dev (Postgres local via `docker-compose.yml`) já são instâncias separadas, então o sufixo só convidaria erro de copiar/colar na connection string.
- **Role de runtime:** `competa_api` — único role hoje (dev solo, um único consumidor). Criar `competa_migrator` separado só quando migration parar de rodar com o mesmo role que serve tráfego; não antes.
- **Senha:** em dev, nenhuma (`POSTGRES_HOST_AUTH_METHOD=trust` no compose — o Postgres local não sai da rede da máquina). Em produção, a que o Supabase gera; nunca commitada, nunca em log; guardada só como secret do Fly (`flyctl secrets set`).

## API

- REST na API Nest; endpoints kebab-case, plural para coleções (`/companies`, `/periods/:id/close`).
- Validação de input: `ZodValidationPipe` com schemas de `libs/contracts` (mesmos do frontend).
- Autenticação: **Better Auth montado na API** (`/api/auth/*`) — pacote comunitário `@thallesp/nestjs-better-auth` com fallback manual documentado; sessão por cookie.
- **CORS/cookies entre origens** (`app.` ↔ `api.`): CORS restrito a `WEB_URL` com `credentials: true`; cookie domain compartilhado; `trustedOrigins` no Better Auth; no Angular, interceptor com `withCredentials: true`. Dev local: proxy do Angular (`proxy.conf.json`) evita CORS.
- **Fluxo público de upload:** rotas com `UploadTokenGuard` (token do `upload_link`, hash + expiração), escopo SÓ-upload — nunca sessão, nunca Better Auth.
- Upload de arquivos: direto ao R2 via URL pré-assinada (API só emite URLs e registra `document`); limites 100 MB/arquivo, 500/envio, 1000 docs / 500 MB acumulados por Solicitação (AVAIL-2). O presign assina `content-length` e `content-type`.
- Formato de erro e paginação: envelope `{ data }` / `{ data, meta }` (`ResponseInterceptor`) e erro `{ error: { code, message, details? } }` (`AppErrorFilter`).
- **Rate limiting:** `@nestjs/throttler` como guard global (dois baldes: 30/10s para rajada, 120/60s para abuso sustentado); rotas que criam recurso caro têm limite próprio via `@Throttle` (o presign é 20/60s). Excesso responde **429** `TOO_MANY_REQUESTS`, nunca 500.
- **Migrations versionadas:** `pnpm --filter api db:generate` cria o SQL a partir do schema, `db:migrate` aplica. `db:push` existe só para prototipagem local. Mudança de coluna com dado existente exige migration de backfill na mesma leva.

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
- Não expor documento a quem não é o Contador da Contabilidade dona ou Responsável da Empresa (LGPD) — e ao Responsável nunca se serve o **conteúdo** do arquivo, só nome/status/prazo/autor (ver [`domain.md`](./domain.md)).
- Não extrair zip no servidor nem parsear XML de NF na v1.
- Não criar pastas `entities/`/`vo/`/`usecases/` nem serviço pass-through — só controller e repositório.
- Não comentar código que se explica sozinho — renomear/extrair antes; comentário só nos casos da seção acima.
- Não construir o que é Generic: auth (Better Auth), storage (R2), billing → integrar.
- Não divergir de `database-schema.md` sem atualizar o documento na mesma mudança.

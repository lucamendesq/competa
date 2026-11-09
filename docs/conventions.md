# Convenções — Coleta de Documentos Contábeis

> Documento vivo. Atualizar conforme o projeto evolui. Padrões marcados `{a definir}` são decisões abertas — resolver na primeira feature que precisar.

## Stack canônica

TypeScript · **pnpm workspaces** · **React 19 (SPA, CSR — sem SSR, Vite)** · **Tailwind CSS + shadcn/ui** · **NestJS (todo o backend)** · Drizzle ORM · Postgres (host {a definir}) · **Better Auth** (na API) · Cloudflare R2 · `@nestjs/event-emitter` · zod (`libs/contracts`) · Mobile futuro {a decidir: React Native vs Flutter}.

## Nomenclatura

- **Identificadores em inglês** (código, banco, eventos); **PT-BR em docs, UI e dados exibidos**. O glossário PT↔EN em [`domain.md`](./domain.md#glossário-linguagem-ubíqua-pten) é **normativo** — só se usa o termo EN registrado (Solicitação → `request`, nunca `solicitation`).
- Proibidos em código: `client`, `user`, `month` soltos → `company`/`accounting_firm`, `accountant`/`contact`, `period`/`reference_month`. (Exceção: tabela `user` do Better Auth.)
- camelCase para variáveis/funções; PascalCase para tipos/componentes; kebab-case para arquivos (`pending-panel-page.tsx`).
- **A regra vale para pasta e nome de arquivo do `apps/web` também**: `features/companies/components/companies-list-page.tsx`, nunca `features/empresas/`. O que fica em PT-BR é o **path da URL** (`/empresas`, `/competencias`, `/envio/:token`) e todo o texto de tela — é o que o usuário lê.
- Tabelas snake_case **singular** (`request_item`); estados como `text` + `check` constraint; eventos PascalCase verbo no passado (`DocumentRejected`).

## Frontend (React)

O padrão normativo completo está em [`react-standards.md`](./react-standards.md). O essencial:

1. **Estado do servidor só no TanStack Query**, com key factory por feature; nada de `useEffect` para buscar ou derivar dado. Formulários com **React Hook Form + `zodResolver`** sobre os schemas de `libs/contracts` (os mesmos da API) e `applyFieldErrors` nos 422.
2. Componente **nunca** chama `fetch`/`api` direto — sempre pela pasta `api/` da feature (uma chamada por arquivo) e pelos hooks de `queries/`.
3. Artefato usado por UMA feature vive nela; promove para `shared/` na **segunda** feature que usar — nunca preventivamente. Imports na direção `shared → features → app`; uma feature só vê outra pelo `index.ts`, e só a `catalog` é importável por outra.
4. Guards de rota são **UX** (redirect sem sessão); a segurança real são os guards da API.
5. **Styling = Tailwind + shadcn/ui:** utilities no JSX por padrão; os primitivos (Radix via shadcn) vivem em `shared/components/ui/`. Nenhuma outra biblioteca de componentes; `.css` de componente é exceção rara.
6. Sem `memo`/`useMemo`/`useCallback`: o React Compiler cobre a memoização; exceção só com medição registrada em comentário `ponytail:`.

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
- **CORS/cookies entre origens** (`app.` ↔ `api.`): CORS restrito a `WEB_URL` com `credentials: true`; cookie domain compartilhado; `trustedOrigins` no Better Auth; no web, `credentials: 'include'` no api-client.
- **Fluxo público de upload:** rotas com `UploadTokenGuard` (token do `upload_link`, hash + expiração), escopo SÓ-upload — nunca sessão, nunca Better Auth.
- Upload de arquivos: direto ao R2 via URL pré-assinada (API só emite URLs e registra `document`); limites 100 MB/arquivo, 500/envio, 1000 docs / 500 MB acumulados por Solicitação (AVAIL-2). O presign assina `content-length`, `content-type` e `x-amz-checksum-sha256` (o cliente calcula o SHA-256 com `crypto.subtle` e manda o mesmo valor no presign e no header do PUT); por isso o CORS do bucket precisa liberar o header `x-amz-checksum-sha256`.
- Formato de erro e paginação: envelope `{ data }` / `{ data, meta }` (`ResponseInterceptor`) e erro `{ error: { code, message, details? } }` (`AppErrorFilter`).
- **Rate limiting:** `@nestjs/throttler` como guard global (dois baldes: 30/10s para rajada, 120/60s para abuso sustentado); rotas que criam recurso caro têm limite próprio via `@Throttle` (o presign é 20/60s). Excesso responde **429** `TOO_MANY_REQUESTS`, nunca 500.
- **Migrations versionadas:** `pnpm --filter api db:generate` cria o SQL a partir do schema, `db:migrate` aplica. `db:push` existe só para prototipagem local. Mudança de coluna com dado existente exige migration de backfill na mesma leva.

## Testes

- API: {a definir — sugestão: Jest (default Nest)} · Web: Vitest + Testing Library + MSW (fluxos críticos em `apps/web/src/testing/flows`).
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
- Não manter dois sistemas de estilo: utilities Tailwind por padrão; `.css` de componente é exceção justificada, nunca o caminho normal; não introduzir outra biblioteca de componentes.
- Não colocar lógica de negócio no web — ele renderiza, valida forms com `libs/contracts` e chama a API pelos hooks da feature.
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

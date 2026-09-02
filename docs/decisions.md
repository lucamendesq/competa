# Decisões Arquiteturais — Coleta de Documentos Contábeis

> Registro do "porquê" das decisões (antigas ADRs). Ao reverter/superar uma decisão, adicione uma nova entrada em vez de reescrever a antiga.
> Autor: Luca Mendes (fundador). Datas entre 2026-08-26 e 2026-08-27.

## Índice

| # | Decisão | Status |
|---|---------|--------|
| [D01](#d01--backend-monólito-modular) | Backend monólito modular com bounded contexts como pastas | Parcialmente superada por D07/D10 |
| [D02](#d02--better-auth-para-autenticação) | Better Auth para autenticação (substitui Supabase Auth) | Vigente |
| [D03](#d03--banco-e-código-em-inglês-ubíqua-pt-br) | Banco e código em inglês; linguagem ubíqua PT-BR | Vigente |
| [D04](#d04--checklist-por-template--overrides) | Checklist por referência a template + overrides (não cópia) | Vigente |
| [D05](#d05--competência-como-ciclo-prazo-por-item) | Competência como ciclo; prazo opcional por item | Vigente |
| [D06](#d06--multi-arquivo--zip-sem-extração) | Multi-arquivo nativo + zip aceito sem extração | Vigente |
| [D07](#d07--monorepo-frontend--api-nestjs) | Monorepo: frontend + API NestJS separada | Parcialmente superada por D10 |
| [D08](#d08--better-auth-na-api-nestjs) | Better Auth na API NestJS; guards como fronteira de acesso | Vigente |
| [D09](#d09--feature-modules-camadas-sob-demanda) | Feature modules; camadas sob demanda; DDD tático descartado | Vigente (item 3 refinado por D10) |
| [D10](#d10--angular-spa-csr--nx) | Angular SPA (CSR) como frontend; monorepo Nx; mobile em aberto | Parcialmente superada por D-06 da spec (sem Nx) |
| [D11](#d11--tailwind--spartan-ui) | Styling do web: Tailwind CSS + Spartan UI | Vigente |

---

## D01 — Backend monólito modular

**Contexto:** dev solo, 3 bounded contexts. Separar em serviços independentes multiplicaria custo de operação/deploy sem demanda de escala (~50 escritórios ≈ 1.500 destinatários/mês).

**Decisão:** um único backend (monólito) com os bounded contexts como **módulos/pastas**; import cruzado proibido, comunicação por eventos/funções públicas. Eventos começam síncronos; fila/broker só se o volume pedir.

**Alternativas rejeitadas:** microsserviços por context (sofisticação sem demanda, triplica operação); serverless por caso de uso (fragmenta o domínio, dificulta o fan-out transacional e testes de invariantes).

**Status:** parcialmente superada — o backend segue monólito modular, mas vive em `apps/api` (NestJS) num monorepo Nx (D07/D10); a organização em módulos foi refinada por D09.

## D02 — Better Auth para autenticação

**Contexto:** a modelagem inicial assumia Supabase Auth (magic link). O fundador decidiu remover o acoplamento a provedor externo.

**Decisão:** **Better Auth** com adapter Drizzle — tabelas de auth (`user`, `session`, `account`, `verification`) no **mesmo Postgres**. Login do Contador por email+senha e/ou magic link; Responsável cadastrado usa a mesma instância. O **Link de Upload continua sendo token próprio do produto** (não é sessão, não passa pelo Better Auth). **Isolamento multi-tenant é responsabilidade da aplicação** (escopo por `accounting_firm_id` via helper obrigatório), não de RLS acoplada a `auth.uid()`.

**Consequências:** sem vendor lock-in; joins diretos com `auth_user_id`; transação única no signup; custo zero por MAU. Em troca, rate limit / emails de verificação / hardening / isolamento por tenant ficam sob nossa responsabilidade.

**Alternativas rejeitadas:** Supabase Auth (acopla auth ao host do banco); Clerk/Auth0 (custo por MAU + dependência externa); NextAuth (DX inferior para o stack).

## D03 — Banco e código em inglês; ubíqua PT-BR

**Contexto:** a modelagem original mandava código PT-BR (`Solicitacao`, `abrirCompetencia()`). O fundador decidiu tabelas/colunas em inglês (schema Drizzle É código; tabelas do Better Auth já são EN).

**Decisão:** **identificadores técnicos em inglês** (tabelas, colunas, entidades, funções, eventos, pastas). **Linguagem ubíqua PT-BR** em docs/UI/conversas e em dados exibidos (catálogo permanece em PT — é dado). O **mapa PT↔EN** ([`domain.md`](./domain.md#glossário-linguagem-ubíqua-pten)) é **normativo**. Convenções: tabelas snake_case singular; tipos PascalCase; eventos PascalCase verbo no passado. Proibidos: `client`, `user`, `month` soltos.

**Alternativas rejeitadas:** código todo em PT-BR (conflita com schema EN); misto tabelas EN + entidades PT (pior dos dois mundos).

## D04 — Checklist por template + overrides

**Contexto:** ao cadastrar Empresa, o Contador escolhe um template e pode editá-lo levemente. Referência vs. cópia?

**Decisão:** **referência + override.** `company.checklist_template_id` aponta o template; desvios viram `company_checklist_override` (`add`/`remove`). O **checklist efetivo** é computado por consulta (template − removidos + adicionados). Templates do produto são imutáveis; a Contabilidade **deriva** o seu (`derived_from`). Na **abertura da Competência**, o checklist efetivo é congelado como snapshot em `request_item`.

**Consequências:** editar o template propaga para todas as Empresas do tipo no mês seguinte; snapshot dá a invariante "checklist congelado" sem versionamento.

**Alternativas rejeitadas:** cópia no cadastro (atualizar template não propaga → N edições); versionamento completo de template (complexidade sem demanda).

## D05 — Competência como ciclo; prazo por item

**Contexto:** documentos têm vencimentos diferentes (extrato após o mês; DAS após ~dia 20; folha dentro do próprio mês). Cogitou-se abandonar a Competência e agendar por tipo de documento.

**Decisão:** **a Competência (`period`) permanece a unidade do ciclo** (fan-out, painel, zip, encerramento). O vencimento entra **por item, dentro do ciclo**: `due_day` + `due_month_offset` (0 = mês de referência; 1 = mês seguinte), opcionais. `request_item.due_date` congelado na abertura; `NULL` herda o prazo da competência. **Lembretes continuam por Solicitação** (uma mensagem agrupa os itens pendentes). `DeadlineMissed` passa a ser por item.

**Alternativas rejeitadas:** cobrança exclusiva por tipo de documento (multiplica mensagens ~5–6×, mata o "abrir o mês", scheduler complexo); prazo único por competência (mantido só como fallback).

## D06 — Multi-arquivo + zip sem extração

**Contexto:** itens como "Notas Fiscais" variam de 1 a centenas de arquivos/mês.

**Decisão:** **os dois.** Multi-arquivo é o caminho principal da UI (1 Item : N Documentos). **Zip aceito como formato a mais, armazenado sem extração na v1** (é o que emissores/portais já exportam). **Sem parsing/validação de XML de NF na v1.** **Revisão em lote** opera no Item. **Upload direto ao R2** por URL pré-assinada. **Limites:** 100 MB/arquivo, 500/envio.

**Consequências:** zero fricção nos dois extremos; nenhuma superfície de zip bomb/path traversal na v1. Painel não mostra quantas notas há num zip (melhoria v1.5: ler o central directory sem extrair).

**Alternativas rejeitadas:** só multi-arquivo (força descompactar o lote); só zip (impraticável no celular); zip com extração server-side (adiada — risco > benefício na v1).

## D07 — Monorepo: frontend + API NestJS

**Contexto:** a D01 previa monólito Next.js fullstack. O modelo híbrido do Next (Server Components/Actions/Route Handlers) exigia uma tabela de decisão por operação — o fundador prefere o paradigma único Controller → Use Case → Repositório, com tudo exposto como API HTTP. Cargas que favorecem um processo Node persistente: cron de lembretes e streaming de zip.

**Decisão:** **monorepo** com frontend e **API NestJS separada**. **Toda operação é endpoint REST da API Nest** (sem Server Actions, sem lógica de negócio no front). Drizzle/migrations/schema em `apps/api/src/database/`. Cron via `@nestjs/schedule`; zip por streaming; contratos zod compartilhados desde o dia 1.

**Consequências:** um paradigma só (velocidade de dev solo); mobile futuro consome a mesma API. Em troca: dois deploys e CORS/cookies entre origens; painel faz round-trip HTTP (aceito).

**Alternativas rejeitadas:** Next fullstack (conflita com o fluxo mental do fundador); tudo em Route Handlers (paga o imposto de API sem ganhar estrutura); Node/Express puro (reinventa o esqueleto do Nest).

**Status:** parcialmente superada por D10 (Next.js → Angular; pnpm workspaces → Nx). Permanecem válidos: API NestJS separada, tudo como REST, contratos compartilhados, cron/streaming na API.

## D08 — Better Auth na API NestJS

**Contexto:** com o backend em NestJS (D07), a integração Better Auth ↔ Nest é mantida pela comunidade (`@thallesp/nestjs-better-auth`). Reavaliou-se Better Auth vs Supabase Auth do zero.

**Decisão:** **manter Better Auth**, montado na API Nest. Fundamentos: signup transacional (`user` + `accounting_firm` + `accountant` no mesmo Postgres, uma transação); email transacional já no dia 1; client Expo oficial barateia o mobile; lock-in ≈ zero. **Forma:** pacote comunitário **com fallback manual documentado** (~40 linhas: `toNodeHandler(auth)` em `/api/auth/*`, `bodyParser: false` nessas rotas, guard via `auth.api.getSession()`). **Fronteira de acesso = Guards do Nest:** `AuthGuard` (sessão) → `TenantGuard` + `@CurrentScope()` injeta **`FirmScope`** (tipo branded inconstruível fora de `auth/`, exigido por todo repositório) → `UploadTokenGuard` para as rotas públicas de upload (`UploadScope`, só escrita).

**Consequências:** isolamento por tenant garantido por **tipo**, não por disciplina. Em troca: glue comunitário no caminho crítico (mitigado pelo fallback); cookies de sessão entre `app.` e `api.` exigem configuração explícita.

**Alternativas rejeitadas:** Supabase Auth (quebra a atomicidade do signup); Passport (não é auth completo — hash/sessão/reset/magic link na mão); Clerk/Auth0 (custo + dependência externa).

## D09 — Feature modules, camadas sob demanda

**Contexto:** a modelagem original prescrevia DDD tático (fronteiras policiadas, `events.ts`, fachadas `public.ts`, agregados, `entities/`, `vo/`). Para um MVP de ~14 tabelas de dev solo, é cerimônia sem retorno.

**Decisão:**
1. **O feature module do Nest É o bounded context na dose certa** — organização por feature, nunca por camada.
2. **Camada sob demanda:** use case só onde há lógica real; CRUD simples → controller → repository direto. Um repositório por módulo.
3. **Eventos de domínio são vocabulário** (nos docs); no código, comunicação entre módulos (item refinado por D10 → `@nestjs/event-emitter` síncrono).
4. **Sem `entities/`/`vo/`:** tipo da entidade = `$inferSelect` do Drizzle; VOs em `common/` quando surgirem.
5. **Direção de dependência é convenção, não polícia:** companies/checklists → periods/requests → messaging.
6. **O que NÃO se abre mão:** `FirmScope`/`UploadScope` nos repositórios, interface única por provedor de mensagem, invariantes nos use cases, contratos zod em `libs/contracts`.

**Alternativas rejeitadas:** DDD tático completo (indireção paga em toda feature; vale para times grandes); organização por camada (cada mudança toca 4+ pastas, briga com o Nest).

## D10 — Angular SPA (CSR) + Nx

**Contexto:** a D07 definia Next.js frontend-only. Reavaliação do fundador.

**Decisão:**
- **`apps/web` = Angular SPA (CSR)** — sem SSR/hydration; deploy estático atrás de CDN.
- **`apps/api` = NestJS** — inalterado (D07/D08 seguem valendo).
- **Monorepo Nx** (substitui pnpm workspaces puro) com **`libs/contracts`** (zod compartilhado web ↔ api ↔ mobile).
- **Eventos síncronos entre módulos via `@nestjs/event-emitter`** (refina D09). In-process; fila/outbox fora da v1.
- **Sem CQRS, sem microservices** — só `@Module` + event-emitter síncrono.
- **Escopo multi-tenant estrutural:** Guard/Interceptor request-scoped injeta `FirmScope`.
- **Mobile fica EM ABERTO: React Native vs Flutter.** Insumos: client Expo oficial do Better Auth favorece RN; Flutter adiciona Dart (2ª linguagem) e exigiria client de auth próprio.

**Racional:** um paradigma (módulos/DI/decorators) do front ao back; Nest expressa bounded contexts/eventos/tenant-scoping com suporte de framework; painel é forms/CRUD-pesado (Typed Reactive Forms encaixa); nada precisa de SSR.

**Alternativas rejeitadas:** manter Next frontend-only (subutilizado sem SSR, filosofia distinta do Nest); React SPA/Vite (sem apego a React nem certeza do RN); Angular Universal/SSR (nenhuma página precisa de SEO/first-paint público).

**Status:** parcialmente superada — o item "Monorepo Nx" foi revertido pela D-06 da spec (`docs/superpowers/specs/2026-09-01-backend-mvp-design.md`): **pnpm workspaces puro**, sem Nx. Motivo: dev solo, só dois apps (`web`, `api`) — o ganho de Nx (cache de build, task graph, boundaries) é baixo nessa escala e não paga a cerimônia de configuração/manutenção. Os demais itens da decisão (Angular SPA/CSR, `libs/contracts`, eventos síncronos, escopo multi-tenant estrutural, mobile em aberto) seguem vigentes.

## D11 — Tailwind + Spartan UI

**Contexto:** com Angular decidido (D10), faltava o sistema de estilo/componentes.

**Decisão:** **Tailwind CSS** como motor de estilo (utilities no template por padrão; upload é mobile-first). **Spartan UI** como biblioteca de componentes (shadcn-style para Angular, headless sobre CDK) — os componentes entram no repositório e são estilizados com Tailwind. **Angular Material descartado.** SCSS por componente só quando um estilo não for expressável em utilities (deve ser raro).

**Consequências:** um único sistema de estilo; componentes Spartan vivem no repo (customização de marca sem lutar contra encapsulamento). Em troca: widgets pesados (datepicker, table, dialog) exigem composição via Spartan/CDK.

**Alternativas rejeitadas:** Angular Material (visual opinado, customização dolorosa); SCSS por componente (overhead de arquivo/nomenclatura em app CRUD-pesado).

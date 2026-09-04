# AGENTS.md — Coleta de Documentos Contábeis

Guia para agentes de IA (e humanos novos) trabalharem neste repositório. Leia isto primeiro; ele aponta para os detalhes em [`docs/`](./docs/README.md).

## O que é o projeto

SaaS que elimina o garimpo manual de documentos contábeis: a **Contabilidade** define o checklist mensal de cada **Empresa**, **"abre a competência"**, e o sistema cobra por email/WhatsApp, recebe os arquivos por **link sem senha**, mostra no painel **"quem faltou"** e entrega tudo em **zip por empresa/competência**. Público: escritórios contábeis pequenos (1–5 pessoas). **Dev solo.**

> **Estado (2026-09-03): backend das Fases 0–2 no ar** (auth/tenant + cadastro: catálogo, templates, Empresas, Responsáveis, overrides, checklist efetivo). `apps/web` ainda é o scaffold do Angular — nenhuma tela existe. Os documentos descrevem a **intenção de design** aprovada; ao divergir, atualize o doc na mesma mudança.

Contexto completo: [`docs/product.md`](./docs/product.md).

## Como o Luca gosta de trabalhar

- **Menos código é melhor.** YAGNI. A solução mais simples que funciona vence. Não abstraia por antecipação, não crie interface com uma implementação, não adicione dependência para o que cabe em poucas linhas.
- **Fatias verticais finas.** Cada mudança entrega algo demonstrável rodando localmente (ver [`docs/roadmap.md`](./docs/roadmap.md)). O banco cresce **uma tabela por vez**, conforme a feature precisa — nunca as 14 de uma vez.
- **Um paradigma só, do front ao back:** módulos, DI, decorators (Angular + NestJS). É deliberado — não introduza estilos concorrentes.
- **Entenda antes de mexer.** Trace o fluxo inteiro que a mudança toca; corrija na raiz (na função compartilhada), não no sintoma de um caller só.
- Comunicação/docs em **PT-BR**; identificadores de código/banco em **inglês** (ver glossário abaixo).

## Stack

TypeScript · **pnpm workspaces** (monorepo) · **Angular SPA (CSR, sem SSR)** + **Tailwind CSS + Spartan UI** · **NestJS** (todo o backend) · Drizzle ORM · Postgres · **Better Auth** (na API) · Cloudflare R2 · `@nestjs/event-emitter` · zod (`libs/contracts`). Mobile futuro: {a decidir — React Native vs Flutter}.

## Estrutura alvo do monorepo

```
apps/
  web/          # Angular SPA — SÓ frontend (painel do Contador + página pública de upload)
  api/          # NestJS — TODO o backend (REST, auth, eventos, cron, zip, webhooks)
  mobile/       # futuro — consome a MESMA API
libs/
  contracts/    # schemas zod por recurso — validados no form (web) E no pipe (api)
docs/           # documentação viva (comece por docs/README.md)
```

`apps/api/src/modules/`: `companies` · `checklists` · `periods` · `requests` · `messaging`. Layout detalhado (web e api) em [`docs/architecture.md`](./docs/architecture.md).

## Regras que NÃO se violam

1. **Nomenclatura EN/PT.** Identificadores em inglês pelo glossário **normativo** ([`docs/domain.md`](./docs/domain.md#glossário-linguagem-ubíqua-pten)); nunca EN fora do mapa. **Proibidos soltos:** `client`, `user`, `month` → use `company`/`accounting_firm`, `accountant`/`contact`, `period`/`reference_month`. (Exceção: tabela `user` do Better Auth.)
2. **`FirmScope`/`UploadScope` em todo repositório.** Tipos branded criados só pelos guards de `auth/`. Query sem escopo **não compila**; contornar o tipo é **bug de segurança**. Contabilidade A nunca vê dados da B (LGPD/sigilo).
3. **Fluxo de upload é só-escrita.** As rotas com `UploadTokenGuard` exibem nomes/status dos itens mas **NUNCA listam ou baixam conteúdo** de documentos. O Link de Upload é token próprio — não passa pelo Better Auth.
4. **Snapshot congelado na abertura.** Ao "abrir a competência", os itens são copiados (nome/formatos/`due_date`) para `request_item`; mudança posterior no template não afeta solicitações abertas.
5. **Código sem comentários.** O nome da função/variável explica o quê; o `git log` e os `docs/` explicam o porquê. Comentário só quando o código, mesmo bem escrito, não consegue dizer sozinho: bug/limitação de biblioteca externa, workaround não óbvio, invariante de segurança que um refactor inocente quebraria, ou `ponytail:` marcando um atalho deliberado. Na dúvida, **não comente** — renomeie ou extraia. Nunca comentário que repete a linha seguinte, cabeçalho de arquivo, JSDoc de tipo já tipado, ou comentário de "seção".
6. **Duas camadas, só (Nest): controller → repositório.** Não existe pasta `usecases/`. Regra de negócio com lógica real (derivar template, importar CSV, checklist efetivo) vira **método do repositório do módulo**; o controller valida, orquestra e traduz erro em HTTP. Sem `entities/`/`vo/` (tipo = `$inferSelect` do Drizzle). Lógica pura sem banco (merge, parser) fica em módulo solto (`effective-checklist.ts`, `csv.ts`).
7. **Comunicação entre módulos = eventos síncronos** via `@nestjs/event-emitter` (direção: companies/checklists → periods/requests → messaging). **Sem CQRS, sem microservices, sem fila/outbox na v1.**
8. **Styling = Tailwind + Spartan UI.** Utilities por padrão; Spartan em `shared/ui/`. **Angular Material está fora.** `.scss` de componente é exceção rara.
9. **`libs/contracts` (zod) é a única fonte de validação** — mesmos schemas no form do Angular e no pipe do Nest. Componente nunca chama `HttpClient` direto (sempre via service da feature).
10. **Provedores externos** (SES/Resend, Meta, FCM) só atrás de interface em `modules/messaging/providers/`. Falha de canal nunca bloqueia o fluxo (degrada WhatsApp → email).
11. **`docs/database-schema.md` é canônico.** O schema Drizzle deve espelhá-lo; divergência exige atualizar o doc na mesma PR. Sem extração de zip nem parsing de XML de NF na v1.

Lista completa de anti-patterns: [`docs/conventions.md`](./docs/conventions.md#o-que-não-fazer-anti-patterns).

## Glossário rápido (o essencial)

| PT (docs/UI) | EN (código/banco) | É… |
|---|---|---|
| Contabilidade | `accounting_firm` | o tenant (quem paga o SaaS) |
| Contador | `accountant` | usuário da Contabilidade |
| Empresa | `company` | quem envia os documentos |
| Responsável | `contact` | pessoa da Empresa que recebe o link |
| Competência | `period` (`reference_month`) | o mês de referência dos documentos |
| Solicitação | `request` | pedido de docs de 1 Empresa em 1 Competência |
| Item | `request_item` | um documento exigido (snapshot congelado) |
| Documento | `document` | arquivo enviado (1 Item : N Documentos) |
| Link de Upload | `upload_link` | URL sem senha, só-upload, com expiração |

Mapa completo + termos proibidos: [`docs/domain.md`](./docs/domain.md#glossário-linguagem-ubíqua-pten).

## Como rodar tarefas (pnpm)

- Build de tudo: `pnpm -r build`.
- Subir a API em modo watch: `pnpm --filter api start:dev`.
- Aplicar o schema no Postgres: `pnpm --filter api drizzle-push`.
- Criar uma Contabilidade + convite inicial: `pnpm --filter api create-firm`.
- Lint: `pnpm --filter api lint`.

## Documentação

| Doc | Para |
|-----|------|
| [`docs/product.md`](./docs/product.md) | propósito, público, atores, marca, mercado |
| [`docs/architecture.md`](./docs/architecture.md) | monorepo, apps, componentes, integrações |
| [`docs/domain.md`](./docs/domain.md) | subdomínios, invariantes, jornada, glossário, eventos |
| [`docs/conventions.md`](./docs/conventions.md) | código, API, testes, env, git, anti-patterns |
| [`docs/database-schema.md`](./docs/database-schema.md) | **canônico** — DDL, algoritmos, transições de estado |
| [`docs/document-catalog.md`](./docs/document-catalog.md) | seed: tipos de documento + templates fixos |
| [`docs/decisions.md`](./docs/decisions.md) | por que cada escolha (D01–D11) |
| [`docs/roadmap.md`](./docs/roadmap.md) | backlog v1 em fatias finas + marcos |

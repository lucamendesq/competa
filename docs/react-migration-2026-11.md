# Competa — Migração do `apps/web` de Vue 3 para React 19

Data: 2026-11-07 · Branch analisada: `fix/qa-staging-findings` (commit `5634183`) · Escopo: `apps/web` (SPA do painel do Contador, página pública de envio e área do Responsável). A API (`apps/api`), os contratos (`libs/contracts`) e a landing (`apps/landing`) não mudam.

Este documento tem três usos, cada um em uma seção:

- **Seção 1** — o plano: arquitetura alvo, mapeamento Vue → React e ordem de execução. Leitura para o Luca e contexto para os agentes.
- **Seção 2 (Prompt A)** — o prompt para o agente **criar os tickets no Linear**. Cole a seção inteira no agente que tem o conector do Linear.
- **Seção 3 (Prompts B e C)** — o prompt para o agente **executar a migração inteira em sequência**, ticket a ticket, mais o prompt do baseline visual (screenshots).
- **Anexo A** — o padrão React (texto literal do padrão exigido), para virar `docs/react-standards.md` no repositório no primeiro ticket.

## Decisões assumidas (o Luca não respondeu; mude aqui se discordar)

1. **O app React nasce em `apps/web-react` e substitui `apps/web` no cutover (ticket M10.5).** Mesmos paths de URL, mesmo projeto do Cloudflare Pages. Durante a migração os dois apps coexistem no monorepo, e o React tem um projeto de Pages de preview próprio (`competa-web-react-staging`). Alternativa descartada: cutover rota a rota atrás de proxy, que é mais trabalho para um dev solo e não traz ganho com 0 clientes.
2. **Screenshots do app atual viram um ticket (M0.1) com prompt próprio (Prompt C)**, em vez de serem tirados nesta sessão: o Postgres e o Docker do Mac não são alcançáveis daqui. O agente que roda localmente captura cada rota com Playwright e anexa ao épico. Nenhum ticket de tela pode ser fechado sem comparar com esse baseline.
3. **Tickets em PT-BR, identificadores em inglês**, como o repositório manda (AGENTS.md). O Anexo A fica em inglês por ser citação literal do padrão.
4. **Só se porta o que é usado.** Dos 36 primitivos de UI em `components/ui/`, 16 têm consumidor. Os outros 20 (alert-dialog, avatar, badge, breadcrumb, calendar, checkbox, collapsible, dropdown-menu, form, popover, progress, radio-group, select, sidebar, spinner, switch, tabs, toggle-group, alert, tooltip-extras) **não são portados** até aparecer um consumidor (regra "duas usos reais antes de abstrair").
5. **Prefixo dos tickets:** `M<épico>.<n>` (M0.1 … M10.5) é o código interno deste documento. No Linear eles ganham `COM-xxx`; o agente mantém o código `M` no título entre colchetes para rastreio.

---

# Seção 1 — Plano de migração

## 1.1 O que existe hoje (inventário do `apps/web`)

| Camada                        | Vue (hoje)                                                                                                                                                                                                                                                                        | Volume       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Páginas                       | 31 `pages/*.vue` + 2 layouts                                                                                                                                                                                                                                                      | 9.865 linhas |
| Features                      | `features/{billing,checklists,companies,contact-area,firm,messages,periods,requests,team,upload}` com `api/` (funções tipadas sobre `api.client`) e `composables/` (`@tanstack/vue-query`)                                                                                        | 1.300 linhas |
| Estado global                 | Pinia `stores/auth.ts` (sessão do Contador e do Responsável, `can()`, `isOverdue`)                                                                                                                                                                                                | 228 linhas   |
| Infra                         | `api/client.ts` (fetch + envelope `{data}` + paginação + blob/download + 401 → `onSessionExpired`), `api/error.ts` (`ApiError`, `apiErrorMessage`, `apiFieldErrors`, `failureKind`), `api/busy.ts` (contador de mutações em voo), `api/auth-client.ts` (Better Auth + magic link) | 270 linhas   |
| Composables transversais      | `useUpload` (presign → PUT → confirm, com progresso e resultados por arquivo), `usePush` (VAPID + service worker), `usePwaInstall` (beforeinstallprompt, device id, ping `/auth/device`), `useCopy`                                                                               | 360 linhas   |
| Componentes de domínio neutro | Callout, ErrorState, NotFoundState, LoadingRows, PageHeader, StatusPill, Modal, Logo, DueDate, TermsConsent, InstallButton, UploadFeedback, PlanCapBanner, PlanGateNotice, ResendNotice, CatalogPicker, CloseRequestModal                                                         | 17 arquivos  |
| Primitivos de UI              | 36 pastas em `components/ui/` (reka-ui + Tailwind v4 + cva), 16 em uso                                                                                                                                                                                                            | —            |
| Formulários                   | vee-validate + `@vee-validate/zod` com os schemas de `@competa/contracts` (9 telas)                                                                                                                                                                                               | —            |
| Rotas                         | 33 rotas em `router/index.ts`, guards `guestOnly` / `requiresAuth: 'accountant' \| 'contact'`, `document.title` por rota                                                                                                                                                          | —            |
| Build                         | Vite 5 + `@vitejs/plugin-vue` + `@tailwindcss/vite` + `vite-plugin-pwa` (workbox, `importScripts: ['push-handler.js']`, `manifest: false`)                                                                                                                                        | —            |
| Qualidade                     | `vue-tsc -b`, scripts `check:api-error`, `check:upload`, `check:no-diamond`, `check:wcag` (sem Vitest no web)                                                                                                                                                                     | —            |
| Deploy                        | Cloudflare Pages `competa-web` (prod) e `competa-web-staging`; `_redirects` SPA; CI em `.github/workflows/ci.yml`                                                                                                                                                                 | —            |

Mapa de rotas (33) e o arquivo Vue de origem de cada uma:

| Rota                                                  | Guard         | Página Vue                                | Épico |
| ----------------------------------------------------- | ------------- | ----------------------------------------- | ----- |
| `/entrar`                                             | guestOnly     | LoginPage                                 | M1    |
| `/cadastro` (+ redirect `/criar-conta`)               | guestOnly     | RegisterPage                              | M1    |
| `/esqueci-senha`, `/redefinir-senha`                  | guestOnly / — | ForgotPasswordPage, ResetPasswordPage     | M1    |
| `/convite/:linkToken`                                 | —             | InvitePage                                | M1    |
| `/termos`, `/privacidade`                             | —             | TermsPage, PrivacyPage                    | M0    |
| `*` (404)                                             | —             | NotFoundPage                              | M0    |
| `/` → `/competencias`                                 | accountant    | PanelLayout + PeriodsListPage             | M2    |
| `/competencias/:id/pendencias`                        | accountant    | PendingPanelPage                          | M2    |
| `/solicitacoes/:id`                                   | accountant    | RequestReviewPage                         | M3    |
| `/empresas`, `/empresas/nova`, `/empresas/:id/editar` | accountant    | CompaniesListPage, CompanyFormPage        | M4    |
| `/empresas/:id/checklist`                             | accountant    | CompanyChecklistPage                      | M4    |
| `/empresas/importar`                                  | accountant    | ImportCompaniesPage                       | M4    |
| `/templates`, `/templates/:id`                        | accountant    | ChecklistsListPage, ChecklistFormPage     | M5    |
| `/mensagens`                                          | accountant    | MessagesPage                              | M6    |
| `/configuracoes` → `/configuracoes/contabilidade`     | accountant    | FirmSettingsPage                          | M7    |
| `/configuracoes/contadores`                           | accountant    | AccountantsSettingsPage                   | M7    |
| `/configuracoes/whatsapp`                             | accountant    | WhatsAppSettingsPage                      | M7    |
| `/configuracoes/plano`                                | accountant    | PlanPage                                  | M7    |
| `/envio/:linkToken`                                   | token próprio | UploadPage                                | M8    |
| `/minha-area` → `/minha-area/pendencias`              | contact       | ContactLayout + ContactPendingPage        | M9    |
| `/minha-area/acesso`, `/minha-area/definir-senha`     | guestOnly / — | ContactSignInPage, ContactSetPasswordPage | M9    |
| `/minha-area/competencias`                            | contact       | ContactHistoryPage                        | M9    |
| `/perdi-meu-link`, `/perdi-meu-link/confirmar`        | guestOnly / — | RecoverLinkPage, RecoverLinkConfirmPage   | M9    |

## 1.2 Arquitetura alvo

### Stack

| Preocupação              | Escolha                                                                                                                                                                                                                                                   | Substitui                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| UI                       | React 19 + TypeScript strict, Vite 7, `@vitejs/plugin-react` com `babel-plugin-react-compiler`                                                                                                                                                            | Vue 3.5, `@vitejs/plugin-vue`, `vue-tsc` |
| Rotas                    | React Router v7 em **data mode** (`createBrowserRouter`, `lazy` por rota, `errorElement` por segmento, `useSearchParams`, `useBlocker`)                                                                                                                   | vue-router 4                             |
| Estado de servidor       | `@tanstack/react-query` v5 (já é a mesma lib; só muda o adapter)                                                                                                                                                                                          | `@tanstack/vue-query`                    |
| Estado global de cliente | Zustand (dois stores pequenos: `pwa` e `invited-companies`)                                                                                                                                                                                               | Pinia (`auth`) + refs de módulo          |
| Sessão                   | `/auth/me` e `/my/profile` **como queries** (`staleTime: Infinity`, invalidadas por sign-in/out/registro/PATCH do firm), expostas por um `SessionProvider` (Context de baixa frequência) em `app/providers` com o hook `useSession()` em `shared/session` | Pinia `auth`                             |
| Formulários              | React Hook Form + `@hookform/resolvers/zod` com os **mesmos schemas** de `@competa/contracts`                                                                                                                                                             | vee-validate + `@vee-validate/zod`       |
| Primitivos               | **shadcn/ui** (CLI `shadcn` gerando os componentes em `shared/components/ui/`, estilo `new-york`, Tailwind v4, cva/clsx/tailwind-merge mantidos). O `components/ui/` do Vue já é o shadcn-vue, então a paridade é 1:1                                     | shadcn-vue (reka-ui)                     |
| Ícones / toasts          | `lucide-react`, `sonner`                                                                                                                                                                                                                                  | `lucide-vue-next`, `vue-sonner`          |
| Auth client              | `better-auth/react` (`createAuthClient`) + `magicLinkClient`                                                                                                                                                                                              | `better-auth/client`                     |
| PWA                      | `vite-plugin-pwa` (mesma config; `push-handler.js` e `manifest.webmanifest` copiados sem alteração)                                                                                                                                                       | idem                                     |
| Planilha                 | `xlsx` (SheetJS) com `import()` lazy, igual hoje                                                                                                                                                                                                          | idem                                     |
| Lint                     | ESLint 9 flat: `typescript-eslint`, `eslint-plugin-react-hooks` (regras do compiler), `eslint-plugin-jsx-a11y`, `eslint-plugin-boundaries` (shared → features → app)                                                                                      | só `typescript-eslint`                   |
| Testes                   | Vitest + `@testing-library/react` + `@testing-library/user-event` + MSW                                                                                                                                                                                   | 4 scripts `check:*` com `node:assert`    |
| Error boundaries         | `errorElement` do router por segmento + `react-error-boundary` nos widgets de risco (dropzone de upload, importação de planilha, preview de documento)                                                                                                    | nenhum                                   |

Dependências que **não** entram: Redux, Jotai, Formik, styled-components, Axios, Lodash, Moment/Day.js (as datas já são tratadas com `Intl`/`@internationalized/date`), bibliotecas de componentes além do shadcn/ui (os primitivos headless que o shadcn instala por baixo — Radix — entram só como dependência transitiva dos componentes gerados; nunca importados direto).

### Estrutura de pastas

```
apps/web-react/
  src/
    app/
      providers/          query-client provider, SessionProvider, Toaster, ErrorBoundary raiz
      router/             createBrowserRouter, guards (RequireAccountant, RequireContact, GuestOnly), títulos
      routes/             um arquivo por rota: só compõe layouts + páginas das features
      app.tsx
    features/
      auth/               login, cadastro, senha, convite, sessão (queries + mutations)
      periods/            competências, painel de pendências, revisão de solicitação, encerrar, zip, link de upload
      companies/          empresas, formulário, overrides (checklist da empresa), importação, uso do plano
      catalog/            tipos de documento + CatalogPicker (feature-folha: pode ser importada por outras)
      checklists/         templates e editor
      messages/           log de mensagens, reenvio
      team/               contadores e convites
      firm/               dados da Contabilidade e lembretes
      whatsapp/           status, onboard, teste, desconectar
      billing/            plano, checkout, cancelamento
      upload/             página pública de envio, useUpload
      contact-area/       área do Responsável, perdi-meu-link
    shared/
      components/ui/      button, input, label, textarea, native-select, table, pagination, card, dialog, sheet, tooltip, toggle, separator, skeleton, empty, sonner
      components/         Callout, ErrorState, NotFoundState, LoadingRows, PageHeader, StatusPill, Modal, Logo, DueDate, Spinner
      components/layout/  PanelLayout, ContactLayout, PublicLayout
      hooks/              useCopy, useDebouncedValue
      lib/                api-client.ts, api-error.ts, query-client.ts, format.ts, item-status.ts, cn.ts
      session/            tipos da sessão + Context + useSession (o valor é provido por app/providers)
      pwa/                install store (zustand), usePush, device ping, InstallButton
      config/             env.ts (VITE_API_URL, VITE_AUTH_URL validados com zod no boot)
    testing/
      mocks/              handlers MSW por recurso
      factories/          fábricas de Company, Period, Request…
      test-utils.tsx      render com QueryClient + Router + SessionProvider de teste
  public/                 copiado de apps/web/public (icons, manifest, push-handler.js, _redirects, brand)
  scripts/                check-no-diamond.ts, check-wcag-contrast.ts (adaptados para .tsx)
```

Regras de dependência, impostas por lint (`eslint-plugin-boundaries`): `shared` não importa de `features` nem de `app`; `features/*` importam de `shared` e, **só** da feature-folha `catalog`, nunca de outra feature; `app` importa de tudo. Cada feature expõe `index.ts`; `routes/` só importa do `index.ts`.

Por que `periods` absorve a revisão de Solicitação: a Solicitação é "1 Empresa em 1 Competência" (glossário), e o painel de pendências e a revisão compartilham `closeRequest`, `resendUploadLink`, `getUploadLink` e os zips. Separar em duas features obrigaria uma a importar a outra.

Por que a sessão fica em `shared/session` e não em `features/auth`: `can()`, `isOwner` e `isOverdue` são lidos por sete features (PlanCapBanner, PlanGateNotice, layout, firm, team, billing, whatsapp). A regra "features não importam features" exige que o contrato da sessão more em `shared`, e a regra "Context só para valores de baixa frequência como auth/sessão" permite que ele seja um Context. O **dado** continua sendo uma query do TanStack (`authKeys.me()`), nunca copiado para Zustand ou `useState`.

### Mapeamento Vue → React (receitas)

| Hoje (Vue)                                                     | Amanhã (React)                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ref`/`computed` em `<script setup>`                           | `useState` só para o que não é derivável; derivação no render (sem `useEffect` + `setState`)                                                           |
| `watch(search, debounce)` + `ref(page)`                        | `useSearchParams` (filtros, página, aba na URL) + `useDebouncedValue`                                                                                  |
| `useQuery({ queryKey: computed(...) })`                        | `useQuery({ queryKey: xKeys.list(filters) })` com key factory por feature                                                                              |
| `placeholderData: (prev) => prev`                              | `placeholderData: keepPreviousData`                                                                                                                    |
| `mutation.isPending.value`                                     | `mutation.isPending`                                                                                                                                   |
| `useForm` + `useField` (vee-validate)                          | `useForm({ resolver: zodResolver(Schema) })` + `register`/`Controller`; erros 422 do servidor via `apiFieldErrors` → `setError`                        |
| `onBeforeRouteLeave` (editor de template)                      | `useBlocker` + `beforeunload`                                                                                                                          |
| `router.beforeEach` + `meta.requiresAuth`                      | layout routes `<RequireAccountant>` / `<RequireContact>` / `<GuestOnly>` com `useSuspenseQuery(authKeys.me())` e `<Suspense>` por segmento             |
| `router.afterEach` → `document.title`                          | `handle: { title }` na rota + um hook no layout raiz                                                                                                   |
| Pinia `auth`                                                   | query de sessão + `SessionProvider`; `signIn/signOut/...` viram `useMutation` em `features/auth/queries` que invalidam `authKeys.all`                  |
| `api/busy.ts` (`trackBusy`)                                    | removido: `useIsMutating()` do TanStack (e `useIsFetching` para blobs)                                                                                 |
| `usePwaInstall` com refs de módulo + `addEventListener` global | store Zustand `usePwaStore` alimentado por um `subscribe` de módulo (sincronização com sistema externo)                                                |
| `sessionStorage` de "convidadas" em CompaniesList              | store Zustand `useInvitedCompaniesStore` com `persist` (storage: sessionStorage, `partialize`)                                                         |
| `<Teleport>` / `Modal.vue`                                     | `Dialog` do shadcn/ui (portal nativo)                                                                                                                  |
| `v-if="query.isPending"` / `v-else-if="isError"`               | `if (q.isPending) return <Skeleton/>; if (q.isError) return <ErrorState retry={q.refetch}/>; if (!q.data.length) return <EmptyState/>` — nunca `!data` |
| `vue-sonner` `toast.*`                                         | `sonner` `toast.*` (mesma API)                                                                                                                         |
| `<RouterLink active-class>`                                    | `<NavLink className={({isActive}) => ...}>`                                                                                                            |
| `defineProps` + slots                                          | props tipadas + `children`/render props                                                                                                                |

### Ordem de execução e marcos

1. **Fundação (M0)** — pacote, lint, testes, api-client, query-client, tokens, primitivos, router, CI com preview. Marco: `/termos` e `/404` no ar no preview.
2. **Auth (M1)** — sessão e guards; login, cadastro, senha, convite. Marco: entrar no painel vazio.
3. **Painel: shell + Competências + Solicitações (M2, M3)** — o fluxo central do produto. Marco: abrir competência → painel de pendências → revisão → zip.
4. **Empresas e Checklists (M4, M5)**, **Mensagens (M6)**, **Configurações (M7)** — podem andar em paralelo depois de M2.1.
5. **Envio público + PWA (M8)** e **Área do Responsável (M9)** — dependem só de M0/M1 e podem andar em paralelo com 3–4.
6. **Qualidade e cutover (M10)** — testes de fluxo, a11y, PWA, performance, troca em produção, remoção do Vue, docs.

Tamanho: 45 tickets em 11 épicos (P 11 · M 24 · G 10). P = até meio dia, M = um dia, G = dois a três dias de um agente supervisionado — cerca de 12 semanas de trabalho de agente, menos com tickets paralelos nas fases 4 e 5.

## 1.3 Riscos e como cada um está coberto

| Risco                                                                                                          | Cobertura                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Regressão visual silenciosa (o Vue tem 9.8k linhas de template)                                                | Baseline de screenshots (M0.1) e comparação obrigatória nos critérios de aceite de toda tela |
| Contratos compilados velhos ("botão que não faz nada", AGENTS.md)                                              | M0.2 liga o `predev` do root e documenta; M0.4 testa os schemas via MSW                      |
| Sessão duplicada entre query e Context                                                                         | Context recebe **só** o resultado da query; sem estado próprio                               |
| Invariante do fluxo de upload (regra 3 do AGENTS.md: nunca nome de arquivo/`storage_key`/download sob o token) | M8.3 tem critério explícito; o MSW handler do `/upload/:token` não devolve esses campos      |
| Service worker e push                                                                                          | M8.1 copia `push-handler.js` sem mudar; M10.3 verifica com build de produção                 |
| Cross-feature imports crescendo                                                                                | `eslint-plugin-boundaries` desde M0.3                                                        |
| `useEffect` para buscar dados ou derivar estado                                                                | Regra de revisão em todo prompt de execução e lint `react-hooks` (compiler)                  |
| CI do monorepo (`pnpm -r build`, `pnpm lint`) quebrando por dois apps web                                      | M0.10 adiciona o pacote ao CI com nome distinto; M10.5 remove o Vue                          |

---

# Seção 2 — Prompt A: criar os tickets no Linear

> **Cole desta linha até o fim da Seção 2 no agente que tem o conector do Linear.**

## Instruções para o agente

Você vai criar as issues da migração do `apps/web` do Competa de Vue 3 para React 19. Siga os passos na ordem.

1. **Onde criar.** Workspace **Competa**, time com chave **COM**, projeto **competa**. Se o projeto não existir, crie as issues sem projeto e diga isso no relatório.
2. **Duplicatas.** Procure issues com o label `migration-react` ou com o título do épico raiz abaixo. Se existirem, não recrie: complete o que falta e relate.
3. **Labels.** Garanta que existem (crie as que faltam, sem alterar as existentes):

   | Label             | Grupo (se o workspace usa grupos) | Significado                                          |
   | ----------------- | --------------------------------- | ---------------------------------------------------- |
   | `migration-react` | Source                            | Veio deste plano                                     |
   | `web`             | Area                              | `apps/web` / `apps/web-react`                        |
   | `foundation`      | Area                              | Tooling, infra do app, CI                            |
   | `Feature`         | Type                              | Label existente do workspace, se houver              |
   | `Chore`           | Type                              | Idem                                                 |
   | `Improvement`     | Type                              | Idem                                                 |
   | `ready-for-agent` | Triage                            | Totalmente especificado; um agente implementa        |
   | `ready-for-human` | Triage                            | Precisa de um humano (painel, credencial ou decisão) |

4. **Prioridade:** `Urgent` = 1, `High` = 2, `Medium` = 3, `Low` = 4.
5. **Estimativa:** se o time usa estimativas, P = 1, M = 2, G = 3 (escala do time; se for Fibonacci, use 1/3/5).
6. **Status:** tudo em **Backlog**, exceto o épico raiz e os tickets de M0, que vão para **Todo** (ou o primeiro estado "unstarted" do time).
7. **Hierarquia.** Crie primeiro o **épico raiz**. Depois crie os **11 épicos** (E0 … E10) como sub-issues do épico raiz. Depois crie cada ticket `M<x>.<n>` como sub-issue do épico `E<x>` correspondente. Copie título, descrição, labels, prioridade e estimativa **exatamente**. As descrições são Markdown; preserve blocos de código e checklists.
8. **Título:** mantenha o código entre colchetes no início, por exemplo `[M2.3] Lista de Competências…`. É assim que os prompts de execução localizam a issue.
9. **Relações:** aplique a tabela "Relações" no fim desta seção com a relação **blocked by**. Tudo que não está na tabela não bloqueia nada.
10. **Relatório:** devolva uma tabela `COM-xxx | código M | título | prioridade | estimativa`, o link do épico raiz e tudo que você não conseguiu fazer.

Escreva o conteúdo das issues em PT-BR, como está abaixo. É a convenção do repositório. Identificadores de código ficam em inglês.

---

## ÉPICO RAIZ

**Título:** Migração do apps/web: Vue 3 → React 19 (TanStack Query, Zustand, RHF+Zod, React Router)
**Labels:** `migration-react`, `web`
**Prioridade:** High
**Descrição:**

```markdown
Reconstrução do `apps/web` em React 19 + TypeScript strict, seguindo o padrão em `docs/react-standards.md` (criado no ticket M0.2). A API, os contratos (`libs/contracts`) e a landing não mudam. O app novo nasce em `apps/web-react`, ganha um preview próprio no Cloudflare Pages e substitui `apps/web` no cutover (M10.5).

**Princípios que valem para todos os tickets filhos**

- Estado de servidor **só** no TanStack Query (key factories por feature; `isPending`/`isError`/vazio tratados; nunca `!data`).
- Estado local primeiro; Zustand só para estado de cliente global (dois stores: `pwa`, `invited-companies`); Context só para a sessão.
- Filtros, página e aba **na URL** (`useSearchParams`).
- Formulários com React Hook Form + Zod usando os schemas de `@competa/contracts`.
- Sem `useEffect` para buscar dado ou derivar estado. Sem `memo`/`useMemo`/`useCallback` preventivos (React Compiler ligado).
- Direção de import: `shared → features → app`. Features não importam features (exceção: `catalog`). Imposto por lint.
- Toda tela é comparada com o baseline de screenshots do app Vue (M0.1) antes de fechar.
- Regras do `AGENTS.md` continuam valendo: nomenclatura EN/PT, código sem comentários, invariantes do fluxo de upload, Tailwind como único styling.

**Épicos:** E0 Fundação · E1 Auth e sessão · E2 Painel: shell e Competências · E3 Solicitações · E4 Empresas · E5 Checklists · E6 Mensagens · E7 Configurações · E8 Envio público e PWA · E9 Área do Responsável · E10 Qualidade e cutover.

Plano completo: `docs/react-migration-2026-11.md` no repositório (cópia no projeto Competa do Claude, `plans/react-migration-2026-11.md`).
```

---

## E0 — Fundação

**Título:** [E0] Fundação: pacote, tooling, infra do app e CI
**Labels:** `migration-react`, `web`, `foundation`
**Prioridade:** High
**Descrição:**

```markdown
Tudo que precisa existir antes da primeira tela: o pacote `apps/web-react`, lint com regras de arquitetura, infra de testes, api-client, query-client, tokens de design, primitivos de UI usados, router com error boundaries e o preview no Pages. Marco: `/termos`, `/privacidade` e a página 404 no ar no preview.
```

### M0.1

**Título:** [M0.1] Capturar baseline visual do app Vue (screenshot de cada rota) e anexar ao épico
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-human`
**Prioridade:** High
**Estimativa:** P
**Descrição:**

```markdown
## Por quê

A migração não pode "sobrescrever" o que as telas fazem hoje. Cada ticket de tela compara o resultado com um screenshot do app Vue tirado **antes** de qualquer mudança.

## O que fazer

Rodar o app Vue localmente (`pnpm dev` na raiz, API em `development` com seed e `create-firm`, ver `docs/qa/` P1–P4) e capturar, com Playwright, uma imagem de cada rota em dois viewports (desktop 1440×900 e mobile 390×844), nos estados que importam (vazio, com dados, erro quando houver botão de retry). O prompt pronto está em `docs/react-migration-2026-11.md`, Seção 3, **Prompt C**.

Rotas (33): ver `apps/web/src/router/index.ts`. Para as rotas com token (`/envio/:linkToken`, `/convite/:linkToken`) usar os tokens impressos pelo `create-firm` e pelo fan-out da competência aberta.

## Entrega

- [ ] Pasta `docs/qa/baseline-vue-2026-11/` no repositório com `<rota>__<viewport>__<estado>.png` e um `index.md` listando cada imagem e o que ela mostra.
- [ ] As imagens anexadas (ou linkadas) na issue do épico raiz.
- [ ] Nenhuma tela do app Vue alterada.
```

### M0.2

**Título:** [M0.2] Bootstrap do pacote `apps/web-react` (Vite 7, React 19, TS strict, Tailwind v4, React Compiler, PWA) e `docs/react-standards.md`
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## O que fazer

1. Criar `apps/web-react` no workspace pnpm (`pnpm-workspace.yaml` já cobre `apps/*`), nome do pacote `web-react`, `"type": "module"`.
2. Dependências de runtime: `react`, `react-dom` (19.x), `react-router` (v7), `@tanstack/react-query` (v5), `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod` (`catalog:`), `@competa/contracts` (`workspace:*`), `better-auth`, `sonner`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `@fontsource-variable/outfit`, `@fontsource-variable/plus-jakarta-sans`, `@internationalized/date`, `react-error-boundary`, `xlsx` (mesma URL do SheetJS do `apps/web`).
3. Dev: `vite` 7, `@vitejs/plugin-react`, `babel-plugin-react-compiler`, `typescript` 5.x, `@types/react`, `@types/react-dom`, `tailwindcss` 4 + `@tailwindcss/vite`, `vite-plugin-pwa`, `tsx`.
4. `vite.config.ts`: portar o de `apps/web` (tailwind, PWA com `importScripts: ['push-handler.js']`, `manifest: false`, `runtimeCaching` de imagens, alias `@`). Trocar o plugin Vue por `react({ babel: { plugins: ['babel-plugin-react-compiler'] } })`.
5. `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (avalie; se quebrar `@competa/contracts`, deixe de fora e registre), `jsx: react-jsx`, `moduleResolution: bundler`, paths `@/*`.
6. `src/shared/config/env.ts`: ler `VITE_API_URL` e `VITE_AUTH_URL` com um schema zod no boot; falhar cedo com mensagem clara. Copiar `.env.template`.
7. `src/main.tsx` com `<StrictMode>`, `src/app/app.tsx` vazio, `index.html` com os mesmos `<meta>`/ícones/manifest do Vue.
8. Copiar `apps/web/public/` inteiro (icons, brand, `manifest.webmanifest`, `push-handler.js`, `_redirects`, favicons).
9. Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`, `lint`, `test`, `check:no-diamond`, `check:wcag` (os dois últimos entram no M0.4).
10. Raiz: `pnpm dev` continua subindo tudo em paralelo; adicionar `dev:react` que sobe `contracts` em watch + API + `web-react` (porta 5174 para não colidir com o Vue na 5173). `predev` já compila os contratos.
11. Criar `docs/react-standards.md` com o texto do Anexo A de `docs/react-migration-2026-11.md`, precedido de um parágrafo em PT-BR dizendo que é o padrão normativo do `apps/web-react`. Linkar no `AGENTS.md` (seção "Stack"), sem remover ainda o parágrafo do Vue.

## Critérios de aceite

- [ ] `pnpm --filter web-react build` e `typecheck` passam com uma página vazia.
- [ ] `pnpm --filter web-react dev` sobe em `http://localhost:5174` e lê `VITE_API_URL`.
- [ ] O React Compiler está ativo (um componente de teste com `console.log` no render não re-renderiza quando o pai muda com props iguais).
- [ ] `docs/react-standards.md` existe e está linkado no `AGENTS.md`.
- [ ] `pnpm -r build` na raiz continua verde (o Vue e o React coexistem).
```

### M0.3

**Título:** [M0.3] Lint e regras de arquitetura: react-hooks (compiler), jsx-a11y e boundaries shared → features → app
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** P
**Descrição:**

```markdown
## O que fazer

1. Estender o `eslint.config.mjs` da raiz com um bloco para `apps/web-react/**/*.{ts,tsx}`: `typescript-eslint` recommended + `eslint-plugin-react-hooks` (versão com as regras do compiler, `recommended-latest`) + `eslint-plugin-jsx-a11y` (recommended) + `eslint-config-prettier`.
2. `eslint-plugin-boundaries` com os elementos `shared` (`src/shared/**`), `feature` (`src/features/*`), `app` (`src/app/**`), `testing` (`src/testing/**`) e as regras:
   - `shared` só importa `shared`;
   - `feature` importa `shared` e **a própria feature**; a única outra feature permitida é `catalog`;
   - `app` importa tudo; `routes/` só pode importar `features/*/index.ts` (regra de `entry point`);
   - `testing` importa tudo.
3. Regra `no-restricted-imports`: proibir `@tanstack/react-query` fora de `features/*/queries/**`, `shared/session/**`, `shared/pwa/**` e `app/providers/**` (componentes não chamam `useQuery` direto; usam o hook da feature). Proibir `fetch(` fora de `shared/lib/api-client.ts` e `features/upload/api/**` (PUT no storage). Proibir `@radix-ui/*` fora de `shared/components/ui/**` (só o shadcn gerado toca o primitivo headless).
4. `lint-staged` na raiz passa a cobrir `*.tsx`.
5. Prettier: `.prettierrc` já existe; garantir que `tsx` é formatado.

## Critérios de aceite

- [ ] Um import de `features/companies` dentro de `features/periods` falha no lint com mensagem que cita a regra.
- [ ] Um `useQuery` dentro de um componente em `features/x/components/` falha no lint.
- [ ] `pnpm lint` na raiz passa com o pacote vazio.
- [ ] Um `<img>` sem `alt` falha no lint (jsx-a11y ativo).
```

### M0.4

**Título:** [M0.4] Infra de testes: Vitest + Testing Library + MSW, `test-utils.tsx`, e portar os scripts `check:*`
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## O que fazer

1. `vitest` com `environment: jsdom` (ou `happy-dom`), `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw` (v2).
2. `src/testing/test-utils.tsx`: `renderWithProviders(ui, { route, session })` que monta `QueryClientProvider` (client novo por teste, `retry: false`), `createMemoryRouter`, `SessionProvider` com um valor de teste. Exportar `renderHook` equivalente.
3. `src/testing/mocks/server.ts` com `setupServer`; `handlers/` por recurso, começando por `auth` (`/auth/me`, `/my/profile`) e crescendo nos tickets das features.
4. `src/testing/factories/`: funções puras `company()`, `period()`, `panelRow()`, `request()`, `template()` com overrides.
5. Portar os scripts do Vue:
   - `scripts/check-api-error.ts` → `shared/lib/api-error.spec.ts` (mesmos casos).
   - `scripts/check-upload.ts` → `features/upload/hooks/use-upload.spec.ts` no M8.2 (deixar o TODO aqui).
   - `scripts/check-no-diamond.ts` e `scripts/check-wcag-contrast.ts` copiados para `apps/web-react/scripts/`, com `EXTENSIONS` incluindo `.tsx` e sem `.vue`.
6. Scripts `test`, `test:watch`, `check:no-diamond`, `check:wcag` no `package.json`.
7. Política de testes (vai para `docs/react-standards.md`, seção "Testes"): testar hooks de feature (keys, invalidação), fluxos críticos e lógica de negócio; não testar componentes puramente apresentacionais.

## Critérios de aceite

- [ ] `pnpm --filter web-react test` roda e passa (pelo menos `api-error.spec.ts` após o M0.5 — se o M0.5 ainda não existir, um teste de fumaça do `test-utils`).
- [ ] `check:no-diamond` e `check:wcag` passam no pacote novo.
- [ ] Um teste de exemplo mostra MSW interceptando `GET /auth/me` e o `renderWithProviders` resolvendo a sessão.
```

### M0.5

**Título:** [M0.5] `shared/lib/api-client.ts` e `api-error.ts`: portar o cliente HTTP, erros e remover `busy.ts`
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/api/client.ts`, `api/error.ts`, `api/busy.ts`, `api/auth-client.ts`.

## Alvo (React)

- `shared/lib/api-client.ts`: **funções puras, não classe**. `api.get/page/post/patch/put/delete/blobUrl/download` com o mesmo comportamento: base `env.apiUrl`, `credentials: 'include'` só para URLs relativas, `cleanParams`, envelope `{ data }`, `Page<T>` com `meta`, 401 em `/auth/me` e `/my/profile` devolve `null` em vez de disparar expiração, 401 nos demais chama `onSessionExpired`, `download` com revogação do object URL em 60 s, `EMPTY_DOWNLOAD` em blob vazio. Aceitar `AbortSignal` opcional em cada função (o TanStack passa `signal` no `queryFn`).
- `shared/lib/api-error.ts`: `ApiError`, `apiErrorMessage`, `apiErrorCode`, `isNotFound`, `failureKind`, `apiFieldErrors` — copiados; `apiFieldErrors` ganha uma variante `applyFieldErrors(error, setError)` para o React Hook Form.
- `busy.ts` **não** é portado: o indicador de "mutação em voo" vem de `useIsMutating()` (e `useIsFetching({ predicate })` para blobs) no layout.
- `shared/lib/auth-client.ts`: `createAuthClient` de `better-auth/react` com `magicLinkClient` e `baseURL: env.authUrl`.
- Validação de borda: `shared/lib/api-client.ts` exporta `parsed(schema)` para o `queryFn` validar a resposta com zod (`schema.parse(data)`) quando `@competa/contracts` tem o schema de resposta (`responses.ts`), e as features usam isso nos `api/*.ts`.

## Critérios de aceite

- [ ] `api-error.spec.ts` (portado do `check-api-error.ts`) passa.
- [ ] Teste: 401 em `/auth/me` → `null`, sem chamar `onSessionExpired`; 401 em `/periods` → chama.
- [ ] Teste: `download` com blob de tamanho 0 → `ApiError` 404 `EMPTY_DOWNLOAD`.
- [ ] Nenhum `class` no módulo; nenhum estado de módulo além do handler de sessão expirada.
```

### M0.6

**Título:** [M0.6] `query-client.ts` e `app/providers`: defaults do TanStack, Toaster, ErrorBoundary raiz e sessão expirada
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** P
**Descrição:**

```markdown
## O que fazer

- `shared/lib/query-client.ts`: `makeQueryClient()` com `defaultOptions.queries = { staleTime: 30_000, gcTime: 5 * 60_000, retry: (count, error) => !isClientError(error) && count < 3, refetchOnWindowFocus: true }` e `mutations = { retry: 0 }`. `isClientError` = `ApiError` 4xx (igual ao `main.ts` do Vue).
- `app/providers/app-providers.tsx`: `QueryClientProvider` + `SessionProvider` (M1.1 preenche) + `<Toaster richColors position="top-right" />` (sonner) + `ErrorBoundary` raiz (`react-error-boundary`) com uma tela "Algo deu errado" e botão "Recarregar".
- Sessão expirada: registrar `onSessionExpired` uma vez (no provider), que mostra `toast.error('Sua sessão foi encerrada. Entre de novo para continuar.', { id: 'session-expired' })`, limpa `authKeys.all` no `queryClient` e navega para `/entrar` ou `/minha-area/acesso` conforme a área da rota atual (lida de `handle.area` da rota).
- `src/main.tsx` monta `<StrictMode><AppProviders><RouterProvider/></AppProviders></StrictMode>`.

## Critérios de aceite

- [ ] Teste: uma query que recebe 404 não faz retry; uma que recebe 500 faz até 3.
- [ ] Teste: `onSessionExpired` numa rota de Contador leva a `/entrar` e mostra o toast uma vez.
- [ ] Lançar um erro em um componente filho mostra a tela do ErrorBoundary raiz, não tela branca.
```

### M0.7

**Título:** [M0.7] Design tokens (`main.css`) e os 16 primitivos de UI em uso, gerados com shadcn/ui
**Labels:** `migration-react`, `web`, `foundation`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/main.css` (tokens `@theme`, paleta Noite Azulada/Âmbar Solar, fontes Outfit e Plus Jakarta Sans) e `components/ui/{button,input,label,textarea,native-select,table,pagination,card,dialog,sheet,tooltip,toggle,separator,skeleton,empty,sonner}`.

## Alvo (React)

- `src/main.css` copiado **sem mudança de tokens** (mesma paleta, mesmos radius, sem dark mode — o design system descontinuou o dark mode em outubro/2026).
- `npx shadcn@latest init` no `apps/web-react` (estilo `new-york`, Tailwind v4, `components.json` apontando `ui` para `src/shared/components/ui` e `utils` para `src/shared/lib/cn.ts`), depois `npx shadcn@latest add button input label textarea table pagination card dialog sheet tooltip toggle separator skeleton sonner` — **só os 16 em uso** (`native-select` e `empty` não existem no shadcn: portar à mão do Vue, no mesmo estilo). Cada componente fica em `shared/components/ui/<nome>/` com `index.ts`.
- Depois de gerar, **ajustar as classes Tailwind e variantes** (`variant`, `size`) para baterem com as do `components/ui/*.vue` (que é shadcn-vue e já foi customizado para o design system de outubro/2026: tokens `brand`, `anchor`, tons `-700` de contraste). O diff entre o gerado e o Vue é a lista do que ajustar. `Sheet` é o do shadcn com `side`. `Pagination` recebe `page`, `pageCount` e `onPageChange` (sem estado próprio).
- Os componentes gerados são código do repositório (não dependência): podem ser editados, e o `components.json` fica versionado para `shadcn add` futuro. Nunca importar `@radix-ui/*` fora de `shared/components/ui/`.
- `shared/lib/cn.ts` (`clsx` + `tailwind-merge`).
- **Não portar** os 20 primitivos sem consumidor (lista no plano, Decisão 4).
- Acessibilidade: todo primitivo interativo com foco visível (`focus-visible:ring-2 ring-ring`), `aria-*` dos componentes gerados preservado, `Dialog` com `Title`/`Description` obrigatórios.

## Critérios de aceite

- [ ] Uma página de "galeria" interna em `/__ui` (só em `import.meta.env.DEV`) renderiza os 16 primitivos em todas as variantes; screenshot comparado lado a lado com os mesmos componentes no Vue (M0.1 não cobre isso: capturar o Vue abrindo as telas que usam cada variante).
- [ ] `check:wcag` e `check:no-diamond` passam.
- [ ] `Dialog` fecha com Esc, devolve o foco ao gatilho e prende o foco dentro (teste com Testing Library).
- [ ] Nenhum `.css` de componente; só Tailwind.
```

### M0.8

**Título:** [M0.8] Componentes compartilhados de domínio neutro (Callout, ErrorState, NotFoundState, LoadingRows, PageHeader, StatusPill, Modal, Logo, DueDate, Spinner)
**Labels:** `migration-react`, `web`, `foundation`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/components/{Callout,ErrorState,NotFoundState,LoadingRows,PageHeader,StatusPill,Modal,Logo,DueDate}.vue` e `components/ui/spinner`.

## Alvo (React)

`shared/components/<nome>.tsx`. Regras:

- `Modal` é uma casca sobre `Dialog` (título, descrição, `footer` como prop/children), igual ao uso atual em 13 telas.
- `StatusPill` recebe o status e devolve ícone + texto (status nunca é só cor; manter os tons `-700` que passaram no contraste).
- `ErrorState` recebe `error` e `retry`, usa `apiErrorMessage` e `failureKind` para a mensagem (offline / gone / server).
- `Callout` com `tone` (`info|warning|danger|success`), `heading`, children e `actions`.
- `DueDate` formata com `dateBr` e marca atrasado.
- `shared/lib/format.ts` e `shared/lib/item-status.ts` copiados de `utils/` (funções puras; com `format.spec.ts` para `maskedCnpj`, `cnpjInputMask`, `phoneInputMask`, `monthLabel`, `brl`).

Os componentes **com domínio** (TermsConsent, InstallButton, UploadFeedback, PlanCapBanner, PlanGateNotice, ResendNotice, CatalogPicker, CloseRequestModal) **não** entram aqui: vão para as features nos tickets delas.

## Critérios de aceite

- [ ] Cada componente tem uma entrada na galeria `/__ui`.
- [ ] `format.spec.ts` passa.
- [ ] `ErrorState` offline mostra "Sem conexão com o servidor. Verifique sua internet." e o botão de retry chama `retry`.
```

### M0.9

**Título:** [M0.9] Router (React Router v7 data mode): rotas lazy, error boundaries por segmento, títulos, 404, redirects e páginas Termos/Privacidade
**Labels:** `migration-react`, `web`, `foundation`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/router/index.ts`, `pages/{TermsPage,PrivacyPage,NotFoundPage}.vue`, `App.vue`.

## Alvo (React)

- `app/router/router.tsx` com `createBrowserRouter` e **todas as 33 rotas** já declaradas, cada uma com `lazy: () => import('../routes/<nome>')`. As rotas cujo ticket ainda não existe apontam para um `Placeholder` que renderiza o nome da rota (some no cutover).
- Cada rota tem `handle: { title?: string, area?: 'accountant' | 'contact' | 'public' }`. Um hook `useDocumentTitle()` no layout raiz aplica `"<title> - Competa"` ou `"Competa"` (comportamento do `afterEach` atual).
- `errorElement` em cada segmento (raiz, `/`, `/minha-area`, rotas públicas) usando `RouteErrorState` que mostra `ErrorState` para `ApiError` e a tela genérica para o resto; 404 do router cai na `NotFoundPage`.
- Redirects: `/` → `/competencias`, `/criar-conta` → `/cadastro`, `/configuracoes` → `/configuracoes/contabilidade`, `/minha-area` → `/minha-area/pendencias`. Catch-all `*` → `NotFoundPage` (com o mesmo comentário de intenção do Vue, em PT-BR, sobre a tela branca — é uma das exceções de comentário do AGENTS.md).
- Guards (`RequireAccountant`, `RequireContact`, `GuestOnly`) são **declarados** aqui como layout routes mas implementados no M1.1; até lá, deixam passar.
- `/termos` e `/privacidade`: portar o conteúdo tal qual (texto provisório até revisão jurídica), com `PublicLayout` (centralizado, link "Voltar").
- `_redirects` do Pages já cobre o fallback do SPA.

## Critérios de aceite

- [ ] `/termos`, `/privacidade` e `/qualquer-coisa` (404) rendem no preview e batem com o baseline (M0.1).
- [ ] `document.title` muda ao navegar entre `/termos` ("Termos de Uso - Competa") e `/competencias` ("Competa").
- [ ] Um `throw new ApiError(500, …)` dentro de uma rota mostra o `RouteErrorState` daquele segmento, mantendo o layout em volta.
- [ ] Cada rota tem um chunk próprio no `vite build` (code splitting por rota).
```

### M0.10

**Título:** [M0.10] CI: lint, typecheck, testes e build do `web-react`, com deploy de preview no Pages `competa-web-react-staging`
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-human`
**Prioridade:** High
**Estimativa:** P
**Descrição:**

```markdown
## O que fazer

1. `.github/workflows/ci.yml`: o job de lint/build da raiz já pega o pacote novo via `pnpm -r`. Adicionar `pnpm --filter web-react test` e `typecheck` ao job de testes.
2. Novo job `deploy-web-react-staging`, copiado de `deploy-web-staging`: `pnpm --filter @competa/contracts build`, `pnpm --filter web-react build` com `VITE_API_URL=https://staging-api.competa.com.br` e `VITE_AUTH_URL=…/api/auth`, `wrangler pages deploy apps/web-react/dist --project-name=competa-web-react-staging --branch=main`. Dispara em push na branch `staging` e no `workflow_dispatch`.
3. **Humano:** criar o projeto `competa-web-react-staging` no Cloudflare Pages (sem domínio custom; o `*.pages.dev` basta) e adicionar sua origem em `TRUSTED_ORIGINS` da API de staging (CORS/cookie), senão o login não funciona no preview.
4. Registrar em `docs/deploy.md` (seção Staging) que o preview existe e será removido no cutover.

## Critérios de aceite

- [ ] CI verde com os dois apps web.
- [ ] O preview abre `/termos` e consegue fazer `GET /auth/me` na API de staging sem erro de CORS (ver no console).
- [ ] `docs/deploy.md` atualizado.
```

---

## E1 — Auth e sessão

**Título:** [E1] Auth e sessão: login, cadastro, senha, convite e guards
**Labels:** `migration-react`, `web`
**Prioridade:** High
**Descrição:**

```markdown
Sessão como query do TanStack exposta por Context, guards por layout route, e as telas públicas de autenticação do Contador e de aceite de convite. Marco: entrar no painel (vazio) no preview.
```

### M1.1

**Título:** [M1.1] Sessão: queries `/auth/me` e `/my/profile`, `SessionProvider`, mutations de auth e guards `RequireAccountant` / `RequireContact` / `GuestOnly`
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Urgent
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/stores/auth.ts` (Pinia), `router/index.ts` (`beforeEach`), `main.ts` (`onSessionExpired`).

## Alvo (React)

**`shared/session/`**

- `session.types.ts`: `Accountant`, `Contact` (os mesmos tipos do store), com schemas zod `AccountantSession`, `ContactSession` para validar a borda.
- `session-context.ts`: `SessionContext` com `{ accountant, contact, can(capability), isOwner, isOverdue, status: 'loading' | 'ready' }` e `useSession()`. **Nenhum estado próprio**: o valor é derivado das queries.

**`features/auth/`**

- `api/auth.ts`: `getMe()`, `getMyProfile()`, `signUpWithInvite`, `registerFirm`, `acceptContactInvite`, `recoverLink`, `confirmRecoverLink`, `setContactPassword` (POSTs do store) — funções puras sobre `api-client`.
- `queries/auth-keys.ts`: `authKeys = { all: ['auth'], me: () => [...all, 'me'], contactProfile: () => [...all, 'contact-profile'] }`.
- `queries/use-session-queries.ts`: `useMeQuery()` e `useContactProfileQuery()` com `staleTime: Infinity`, `retry: false`, `gcTime: Infinity`. `/auth/me` 401 vira `null` (já tratado no api-client).
- `queries/use-auth-mutations.ts`: `useSignInAccountant`, `useSignInContact`, `useSignOut`, `useRegisterFirm`, `useSignUpWithInvite`, `useAcceptContactInvite`, `useRequestPasswordReset`, `useResetPassword`, `useSendMagicLink`, `useRecoverLink`, `useConfirmRecoverLink`, `useSetContactPassword`. Cada uma com `onSuccess` que **invalida** `authKeys.all` (o `signOut` faz `queryClient.removeQueries({ queryKey: authKeys.all })` e `queryClient.clear()` para não vazar dados de tenant). Mensagens de erro iguais às do store ("E-mail ou senha inválidos.", etc.). O `registerFirm` mantém o fallback: se o `/auth/me` não voltar após o registro, faz sign-in com e-mail e senha.
- `isOverdue` replica a regra do store (OVERDUE; CANCELED com período vencido; trialing com trial vencido).

**`app/providers/session-provider.tsx`**: chama as duas queries (a de contato só quando a de contador deu `null`, replicando `ensureLoaded`) e provê o Context.

**`app/router/guards.tsx`**: layout routes. `RequireAccountant` usa `useSuspenseQuery(meOptions())` (dado crítico de rota; único uso de Suspense no app) dentro de um `<Suspense fallback={<FullPageSpinner/>}>`; sem contador → se há contato, `Navigate` para `/minha-area/pendencias`, senão `/entrar` (guardando `from`). `RequireContact` idem para `/minha-area/acesso`. `GuestOnly` manda a sessão viva para a home dela (`/competencias` ou `/minha-area/pendencias`).

## Critérios de aceite

- [ ] Testes de hook: `useSignInAccountant` sucesso invalida `authKeys.all` e o `useSession()` passa a ter `accountant`; `useSignOut` limpa o cache inteiro.
- [ ] Testes de guard (MSW): sem sessão em `/competencias` → `/entrar`; contato logado em `/entrar` → `/minha-area/pendencias`; contador em `/minha-area/pendencias` → `/minha-area/acesso`.
- [ ] `can('reminderTuning')` é `false` enquanto o `/me` não voltou.
- [ ] Nenhum `useState`/Zustand guarda a sessão; `grep -r "useState" shared/session features/auth/queries` vazio.
- [ ] `isOverdue` testado nos quatro ramos.
```

### M1.2

**Título:** [M1.2] Tela de entrada do Contador (`/entrar`)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** P
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/pages/LoginPage.vue` (209 linhas; vee-validate com schema local de e-mail/senha; link "Esqueci minha senha"; link para `/cadastro` e para `/minha-area/acesso`).

## Alvo (React)

`features/auth/components/login-page.tsx` + `app/routes/login.tsx`. React Hook Form + `zodResolver` com o mesmo schema; `useSignInAccountant`; erro de credencial no topo do formulário (`role="alert"`); botão desabilitado enquanto `isPending`; após sucesso `navigate(from ?? '/competencias', { replace: true })`.

## Critérios de aceite

- [ ] Screenshot bate com `entrar__desktop` e `entrar__mobile` do baseline.
- [ ] Teste (MSW): credenciais erradas mostram "E-mail ou senha inválidos."; certas navegam para `/competencias`.
- [ ] Campos com `label` associado, `autocomplete="email"` / `"current-password"`, `inputmode="email"`.
- [ ] Sem `useEffect`.
```

### M1.3

**Título:** [M1.3] Cadastro público da Contabilidade (`/cadastro`, 2 passos, trial de 14 dias) com `TermsConsent`
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/pages/RegisterPage.vue` (427 linhas): passo 1 Usuário (nome, e-mail, senha), passo 2 Contabilidade (nome, CNPJ opcional com máscara `cnpjInputMask`), aceite de termos (`components/TermsConsent.vue`), `stepOneValid` derivado, `registerFirm` do store.

## Alvo (React)

`features/auth/components/register-page.tsx` + `features/auth/components/terms-consent.tsx`. Um único `useForm` com o schema completo; o passo atual é `useState<'user' | 'firm'>`; `stepOneValid` é derivado de `formState` (sem `useEffect`); CNPJ com máscara via `Controller`; `useRegisterFirm`; sucesso → `/competencias`. Erros 422 do servidor aplicados aos campos com `applyFieldErrors`.

## Critérios de aceite

- [ ] Screenshots dos dois passos batem com o baseline.
- [ ] Teste: avançar só quando o passo 1 é válido; voltar preserva os valores; 422 em `cnpj` aparece no campo.
- [ ] O checkbox dos termos tem link para `/termos` e `/privacidade` e o envio é bloqueado sem aceite.
```

### M1.4

**Título:** [M1.4] Esqueci minha senha e redefinir senha (`/esqueci-senha`, `/redefinir-senha`)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** P
**Descrição:**

```markdown
## Origem (Vue)

`pages/ForgotPasswordPage.vue` (resposta cega: sempre "se o e-mail existir, enviamos"), `pages/ResetPasswordPage.vue` (lê `?token=` da URL; estados `done` / `invalid-link` vindos de `resetPassword` do store).

## Alvo (React)

`features/auth/components/{forgot-password-page,reset-password-page}.tsx`; `useRequestPasswordReset` (`redirectTo: ${location.origin}/redefinir-senha`), `useResetPassword`; o token vem de `useSearchParams`; sem token → estado "link inválido" com botão para pedir outro.

## Critérios de aceite

- [ ] Screenshots batem com o baseline (estado inicial e "enviado").
- [ ] Teste: `INVALID_TOKEN` mostra o estado de link inválido; sucesso mostra "senha redefinida" com link para `/entrar`.
- [ ] A resposta do "esqueci" é idêntica para e-mail existente e inexistente.
```

### M1.5

**Título:** [M1.5] Aceitar convite (`/convite/:linkToken`): Contador e Responsável, convite já usado manda para a entrada
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/InvitePage.vue` (212 linhas): descobre o tipo de convite, formulário de nome + senha, `signUpWithInvite` (Contador) ou `acceptContactInvite` (Responsável, senha opcional conforme D14), 409 → redireciona para a entrada correspondente, `onMounted` para ler o token.

## Alvo (React)

`features/auth/components/invite-page.tsx`. O token vem de `useParams` (sem `useEffect`). Se existir um `GET` do convite na API, usar `useQuery(authKeys.invite(token))`; se o tipo vier só da resposta do POST, manter o comportamento atual. Mutations `useSignUpWithInvite` / `useAcceptContactInvite`; `apiErrorCode === 'INVITE_ALREADY_USED'` ou status 409 → `Navigate` para `/entrar` ou `/minha-area/acesso` com toast explicando.

## Critérios de aceite

- [ ] Screenshots batem com o baseline (convite de Contador e de Responsável).
- [ ] Teste: 409 leva à entrada certa e mostra o toast; sucesso do Contador entra e vai a `/competencias`; sucesso do Responsável faz sign-in e vai a `/minha-area/pendencias`.
- [ ] Senha é opcional no fluxo do Responsável e obrigatória no do Contador (schemas de `@competa/contracts`).
```

---

## E2 — Painel do Contador: shell e Competências

**Título:** [E2] Painel: layout, lista de Competências, abertura e Painel de Pendências
**Labels:** `migration-react`, `web`
**Prioridade:** High
**Descrição:**

```markdown
O fluxo central do produto: abrir a competência, ver quem faltou, cobrar, encerrar. Marco: abrir competência → painel → zip no preview, com paridade visual.
```

### M2.1

**Título:** [M2.1] `PanelLayout`: sidebar, menu mobile, perfil, skip link, indicador de mutação em voo e aviso de inadimplência
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Urgent
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`apps/web/src/layouts/PanelLayout.vue` (181 linhas): nav fixa com 7 itens, header mobile com botão de menu (`aria-expanded`, `aria-controls`), overlay, bloco de perfil com iniciais e menu (Convidar contador só para o dono; Sair), skip link "Pular para o conteúdo", `Callout` de assinatura pendente quando `isOverdue` com link para `/configuracoes/plano`, `<RouterView>` em `main#conteudo`.

## Alvo (React)

`shared/components/layout/panel-layout.tsx` usado pela layout route `/` (dentro de `RequireAccountant`). `menuOpen` e `profileOpen` são `useState` locais (UI local, não Zustand). Itens de nav com `NavLink`. Lê `useSession()` para nome da firma, nome/e-mail/iniciais (derivados no render) e `isOwner`/`isOverdue`. `useSignOut` no "Sair". Uma barra fina de progresso no topo quando `useIsMutating() > 0` substitui o `isBusy` do Vue (se o Vue não mostrava nada visível com `isBusy`, manter só o `aria-busy` no `main`).

## Critérios de aceite

- [ ] Screenshots desktop e mobile (menu fechado e aberto) batem com o baseline de `/competencias`.
- [ ] Teste: menu mobile abre/fecha pelo botão e pelo overlay; o link ativo recebe as classes de ativo; "Convidar contador" só aparece para `isOwner`.
- [ ] O `Callout` de inadimplência aparece quando `isOverdue` e some quando não.
- [ ] Navegação por teclado: skip link visível no foco e leva ao `#conteudo`.
```

### M2.2

**Título:** [M2.2] `features/periods`: api, key factory e hooks de Competências (lista, detalhe, prévia, abrir, encerrar, lembretes, zip)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Urgent
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`features/periods/api/periods.ts`, `features/periods/composables/usePeriodsFeature.ts`, `features/requests/api/requests.ts` (a feature `requests` do Vue é absorvida por `periods` — ver plano, 1.2).

## Alvo (React)

- `features/periods/api/{get-periods,get-period,get-pending-panel,get-period-preview,open-period,add-missing-requests,close-period,run-reminders,download-zips,get-request,publish-review,undo-accept,close-request,resend-upload-link,get-upload-link,open-document}.ts` (um arquivo por chamada, funções puras tipadas com os tipos de `@competa/contracts` `responses.ts`; validar com zod onde houver schema).
- `queries/period-keys.ts`:
  `periodKeys = { all: ['periods'], lists: () => [...all,'list'], list: (p: {page, perPage}) => [...lists(), p], details: () => [...all,'detail'], detail: (id) => [...details(), id], panel: (id) => [...detail(id),'panel'], preview: (referenceMonth) => [...all,'preview', referenceMonth] }` e `requestKeys = { all: ['requests'], detail: (id) => [...all,'detail', id], uploadLink: (id) => [...detail(id),'upload-link'] }`.
- `queries/use-periods.ts` (lista com `keepPreviousData`), `use-period-detail.ts`, `use-pending-panel.ts`, `use-period-preview.ts` (`enabled` só com `YYYY-MM` válido), `use-open-period.ts` (invalida `periodKeys.lists()`), `use-close-period.ts` (invalida `lists()` e `detail(id)`), `use-run-reminders.ts` (invalida `panel(id)`), `use-request-detail.ts`, `use-publish-review.ts` (invalida `requestKeys.detail(id)` e `periodKeys.panel(periodId)`), `use-undo-accept.ts`, `use-close-request.ts` (invalida `requestKeys.detail` + `periodKeys.panel` + `periodKeys.detail`), `use-resend-upload-link.ts`, `use-upload-link.ts`.
- Downloads (`downloadPeriodZip`, `downloadRequestZip`) são mutations (`useMutation`) para terem `isPending` e erro tratável.
- `index.ts` exporta só hooks, componentes de página e tipos.

## Critérios de aceite

- [ ] Teste por hook de escrita: a mutation invalida **exatamente** as keys listadas (spy em `invalidateQueries`), nada mais amplo.
- [ ] Teste: `usePeriods({page:2})` e `({page:1})` têm keys distintas e a lista mantém `placeholderData` na troca de página.
- [ ] Nenhum `queryKey` literal fora de `period-keys.ts`.
```

### M2.3

**Título:** [M2.3] Lista de Competências (`/competencias`): KPIs, tabela paginada, zip e modal "Abrir competência" com prévia do fan-out e resumo dos links
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Urgent
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/PeriodsListPage.vue` (662 linhas): KPIs derivados da lista (competência mais recente, entregues/total), tabela com "Aberta em", prazo, progresso, ações (painel, zip, encerrar com confirmação), paginação; modal de abertura com seletor mês/ano (`defaultReferenceMonth`), `dueDate` opcional, `previewQuery` (`getPeriodPreview`) habilitada só com mês válido e modal aberto, resultado da abertura com resumo (`PeriodOpening`: solicitações criadas, links enviados, falhas de canal) e `addMissingRequests`.

## Alvo (React)

`features/periods/components/{periods-list-page,period-kpis,periods-table,open-period-dialog,period-opening-summary}.tsx`. Página na URL: `?page=`. KPIs derivados no render. Modal: formulário RHF com schema local (`referenceMonth` `YYYY-MM`, `dueDate` opcional); `usePeriodPreview(referenceMonth, { enabled: open && valid })`; após abrir, o diálogo troca para o resumo (estado local `result`), com botão "Ir para o painel". Estados `isPending` (LoadingRows), `isError` (ErrorState com retry), vazio (EmptyState com CTA "Abrir a primeira competência").

## Critérios de aceite

- [ ] Screenshots: lista vazia, lista com dados, modal fechado/aberto com prévia, resumo após abrir — todos comparados ao baseline.
- [ ] Teste (MSW): abrir competência chama `POST /periods` com o body certo, mostra o resumo e a lista é refeita (invalidação).
- [ ] Teste: trocar de página muda `?page=` e preserva a lista anterior enquanto carrega.
- [ ] Encerrar pede confirmação e desabilita o botão enquanto `isPending`.
- [ ] Zip: erro `EMPTY_DOWNLOAD` vira toast "Nenhum documento para baixar."
```

### M2.4

**Título:** [M2.4] Painel de Pendências (`/competencias/:id/pendencias`): quem faltou, filtro por contador, copiar/reenviar link, cobrar atrasados, falhas de canal, encerrar por Empresa ou a Competência
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Urgent
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/PendingPanelPage.vue` (790 linhas, a maior tela): cabeçalho com detalhe da competência, filtro `selectedAccountant` ('all' + contadores), linhas por Empresa com itens faltantes (`MissingItem`), `channelFailures` (rótulos por canal), ações por linha (copiar link via `getUploadLink` + `useCopy`, reenviar link via `resendUploadLink`, abrir revisão, zip da solicitação, encerrar a Solicitação via `CloseRequestModal`), ações de página (`runReminders` "Cobrar atrasados" com `{scanned, sent, busy}`, zip da competência, encerrar competência com confirmação). 17 `toast.*`.

## Alvo (React)

`features/periods/components/{pending-panel-page,panel-filters,panel-row,channel-failures,close-request-dialog}.tsx`. Filtro por contador **na URL** (`?contador=`). Linhas derivadas no render (filtro + ordenação). `useCopy` em `shared/hooks` (`navigator.clipboard`, chave copiada em `useState`, timer limpo no cleanup). `CloseRequestDialog` (porta de `CloseRequestModal.vue`) vive aqui e é reusado pelo M3.1. Mensagens de toast idênticas às do Vue (copiar os textos).

## Critérios de aceite

- [ ] Screenshots desktop/mobile com dados, com falha de canal visível, e com filtro aplicado — comparados ao baseline.
- [ ] Teste: "Cobrar atrasados" com `busy: true` mostra o aviso de "já em andamento"; com `sent > 0` mostra a contagem e invalida o painel.
- [ ] Teste: encerrar a Solicitação de uma linha invalida `periodKeys.panel(id)` e a linha some/atualiza sem reload.
- [ ] Copiar link mostra o toast de sucesso e marca o botão como copiado por 2,5 s.
- [ ] `?contador=` sobrevive a reload e a navegação de volta.
```

---

## E3 — Solicitações

**Título:** [E3] Revisão da Solicitação
**Labels:** `migration-react`, `web`
**Prioridade:** High
**Descrição:**

```markdown
A tela em que o Contador aceita/rejeita o que a Empresa mandou. Vive em `features/periods` (ver plano). Marco: aceitar em lote, rejeitar com motivo, extras, preview e zip no preview.
```

### M3.1

**Título:** [M3.1] Revisão da Solicitação (`/solicitacoes/:id`): aceite em lote, rejeição com motivo, documentos extras, desfazer aceite, preview/baixar avulso, zip e encerrar
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/RequestReviewPage.vue` (486 linhas): estado de revisão local (`acceptedItemIds: Set`, `rejections: Map<itemId, motivo>`, `extras: Map<docId, {decision, rejectionReason}>`), contagem derivada, `publishReview` em lote (`ReviewBatchBody` de `@competa/contracts`), `undoAcceptItem`, `openDocumentContent` (blob URL em nova aba/iframe) e `downloadRequestZip`, `closeRequest` via `CloseRequestModal`, `ResendNotice` quando o link foi rotacionado após rejeição, `displayItemStatus`/`itemRejections` de `utils/item-status`.

## Alvo (React)

`features/periods/components/{request-review-page,review-item,review-extras,document-preview}.tsx`. O rascunho da revisão é **estado local complexo** → `useReducer` com ações `toggleAccept`, `setRejection`, `clearRejection`, `toggleExtra`, `reset` (critério 8 da árvore de decisão). Contagem e "há mudanças" derivados. `usePublishReview` (invalida `requestKeys.detail` e `periodKeys.panel`), `useUndoAccept`. `DocumentPreview` em `react-error-boundary` (blob/iframe é widget de risco); revogar o object URL ao fechar. `ResendNotice` portado para `features/periods/components`.

## Critérios de aceite

- [ ] Screenshots: solicitação sem envios, com envios pendentes, com rejeição e com extras — comparados ao baseline.
- [ ] Teste do reducer: aceitar um item que tinha rejeição limpa a rejeição; `reset` zera tudo.
- [ ] Teste (MSW): publicar envia o `ReviewBatchBody` com os três grupos e, após sucesso, o rascunho zera e o detalhe é refeito.
- [ ] Regra de segurança mantida: o preview só usa `GET /documents/:id/content` (rota do Contador), nunca URL do storage.
- [ ] `useReducer` é o único estado de rascunho; nada em Zustand.
```

---

## E4 — Empresas

**Título:** [E4] Empresas: lista, cadastro/edição, checklist por Empresa e importação de planilha
**Labels:** `migration-react`, `web`
**Prioridade:** High
**Descrição:**

```markdown
`features/companies` (+ a feature-folha `catalog`). Marco: cadastrar uma Empresa com Responsável, ajustar o checklist dela e importar uma planilha no preview.
```

### M4.1

**Título:** [M4.1] `features/companies`: api, key factory, hooks (lista com filtros, detalhe, acessos, overrides, importação, uso do plano) e store `invited-companies`
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`features/companies/api/companies.ts` (176 linhas, 22 chamadas), `composables/useCompaniesFeature.ts` (3 composables), `composables/usePlanUsage.ts`, e o `sessionStorage` `INVITED_KEY` em `pages/CompaniesListPage.vue`.

## Alvo (React)

- `api/` um arquivo por chamada, tipos de `@competa/contracts` (`CompanySummaryResponse`, `CompanyDetailResponse`, `ContactDetailResponse`, `CreateCompanyBody`, `UpdateCompanyBody`, `ContactBody`, `CreateOverrideBody`).
- `queries/company-keys.ts`: `companyKeys = { all, lists(), list(filters: {page, perPage, active?, search?}), details(), detail(id), accesses(id), checklist(id), overrides(id), usage() }`.
- Hooks de leitura: `useCompanies(filters)` (`keepPreviousData`), `useCompany(id)`, `useCompanyAccesses(id)`, `useEffectiveChecklist(id)`, `useOverrides(id)`, `usePlanUsage()`.
- Hooks de escrita com invalidação estreita: `useCreateCompany` (lists + usage), `useUpdateCompany` (detail + lists), `useDeactivateCompany` (lists + usage), `useAddContact`/`useUpdateContact`/`useRemoveContact` (detail), `useRevokeAccess` (detail + lists + accesses), `useSaveOverride`/`useRemoveOverride` (checklist + overrides), `useSendAccessInvites` (lists), `useApplyTemplate` (lists + detail de cada id), `useActivateCompanies` (lists + usage), `useImportCsv` (sem invalidação: é prévia), `useConfirmImport` (lists + usage).
- `store/invited-companies.store.ts`: Zustand com `persist` em `sessionStorage`, estado `{ invitedIds: string[] }`, ações `markInvited(ids)`, `partialize` só de `invitedIds`. Seletor `useIsInvited(id)`.

## Critérios de aceite

- [ ] Testes de invalidação por mutation (spy), como no M2.2.
- [ ] Teste do store: `markInvited` é imutável (novo array) e persiste em `sessionStorage` sob a mesma chave do Vue (`competa:invited`, conferir o valor real de `INVITED_KEY`).
- [ ] `useCompanies({search:'a'})` e `({search:'ab'})` têm keys distintas.
```

### M4.2

**Título:** [M4.2] Lista de Empresas (`/empresas`): filtros na URL, busca com debounce, seleção em lote, convidar para o app, aplicar template, ativar, desativar/reativar e `PlanCapBanner`
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/CompaniesListPage.vue` (607 linhas): abas Ativas/Inativas/Todas com contagens de `usage`, busca com `watch` + debounce, `selectedIds: Set` e "selecionar todas", ações em lote (ativar, aplicar template, convidar para o app com `AccessInviteResult` e marcação em `sessionStorage`), ações por linha (editar, checklist, desativar com confirmação, reativar), status do Responsável ("Sem Responsável" / "Envia por link" / "Usa o app"), `PlanCapBanner` (limite do plano) e `PlanGateNotice`, 13 toasts, paginação.

## Alvo (React)

`features/companies/components/{companies-list-page,companies-filters,companies-table,bulk-actions-bar,contact-status,plan-cap-banner,plan-gate-notice}.tsx`. **URL**: `?page=&ativas=&busca=` via `useSearchParams`; input de busca com `useState` local + `useDebouncedValue` (300 ms) que escreve na URL. `selectedIds` em `useState<ReadonlySet<string>>` (local; limpa ao mudar filtro, derivando por key). Template picker usa `features/checklists`? **Não** — a lista de templates para "aplicar template" é lida por um hook `useTemplatesOptions()` exposto por `features/catalog` (M4.4 move `getTemplates` para `catalog`, pois é leitura de catálogo usada por três features). `PlanCapBanner`/`PlanGateNotice` leem `useSession().can` e `usePlanUsage()`.

## Critérios de aceite

- [ ] Screenshots: vazio, com dados, com seleção, aba Inativas, banner de limite — comparados ao baseline.
- [ ] Teste: digitar na busca atualiza `?busca=` após o debounce e dispara uma única query.
- [ ] Teste: "Convidar para o app" marca a Empresa como convidada (store) e a marca sobrevive a um remount.
- [ ] Aplicar template em lote invalida a lista e mostra o toast com `updated`.
- [ ] Nenhum `useEffect` para sincronizar filtros; a URL é a fonte.
```

### M4.3

**Título:** [M4.3] Cadastro e edição de Empresa (`/empresas/nova`, `/empresas/:id/editar`): Responsáveis, prévia do checklist efetivo, revogar acesso e desativar
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/CompanyFormPage.vue` (667 linhas, 9 `useField`): modo novo/editar pela rota, formulário com `CreateCompanyBody`/`UpdateCompanyBody` (nome, CNPJ com máscara, regime/template, ativa), lista de Responsáveis (`ContactBody`: nome, e-mail, telefone com máscara) com adicionar/editar/remover inline, prévia do checklist efetivo (`getEffectiveChecklist`), na edição: revogar acesso ao app (F10-7, `getAccesses` + `revokeAccess` com confirmação) e desativar; erros 422 por campo; `watch` para recarregar valores quando o detalhe chega.

## Alvo (React)

`features/companies/components/{company-form-page,company-form,contacts-fieldset,effective-checklist-preview,revoke-access-dialog}.tsx`. Um `useForm` com `zodResolver(CreateCompanyBody | UpdateCompanyBody)` e `useFieldArray` para Responsáveis. Na edição, o formulário só monta depois de `useCompany(id)` resolver, recebendo `defaultValues` (sem `useEffect` + `reset`): `if (q.isPending) return <Skeleton/>` e `<CompanyForm key={company.id} defaultValues={…}/>`. Máscaras via `Controller`. `applyFieldErrors` nos 422. Após criar → `/empresas/:id/editar` ou `/empresas` (manter o destino atual do Vue).

## Critérios de aceite

- [ ] Screenshots: novo, editar com Responsáveis, prévia do checklist, diálogo de revogar — comparados ao baseline.
- [ ] Teste: criar envia o body validado pelo schema do contrato; 422 em `contacts.0.email` aparece no campo certo.
- [ ] Teste: revogar acesso invalida detalhe, lista e acessos.
- [ ] Telefone e CNPJ mascarados na digitação e desmascarados no envio (mesmas funções de `format.ts`).
```

### M4.4

**Título:** [M4.4] Feature-folha `catalog` (tipos de documento, templates como opções, `CatalogPicker`) e Checklist da Empresa (`/empresas/:id/checklist`, overrides)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`components/CatalogPicker.vue` (paginado por categoria, `getDocumentTypes`), `features/checklists/api/checklists.ts` (`getDocumentTypes`, `getTemplates`), `pages/CompanyChecklistPage.vue` (357 linhas: checklist efetivo com origem de cada linha — template/override —, adicionar override pelo picker, editar periodicidade/prazo/obrigatório, remover override, `CATEGORY_LABEL`/`PERIODICITY_LABEL`).

## Alvo (React)

- `features/catalog/`: `api/{get-document-types,get-templates}.ts`, `queries/catalog-keys.ts` (`catalogKeys.documentTypes(params)`, `catalogKeys.templates()`), `queries/{use-document-types,use-templates-options}.ts`, `components/catalog-picker.tsx` (Dialog com busca/categoria e paginação, chama `onPick(documentType)`), `index.ts`. É a **única** feature que outras features podem importar (lint M0.3).
- `features/companies/components/{company-checklist-page,checklist-line,override-form}.tsx` usando `useEffectiveChecklist`, `useOverrides`, `useSaveOverride`, `useRemoveOverride` e o `CatalogPicker`.

## Critérios de aceite

- [ ] Screenshots: checklist com e sem overrides, picker aberto — comparados ao baseline.
- [ ] Teste: salvar override invalida `companyKeys.checklist(id)` e `overrides(id)` e a linha mostra origem "override".
- [ ] Teste do picker: trocar categoria reseta a página para 1 (derivação, não efeito).
- [ ] `catalogKeys.templates()` é usada por `companies` (M4.2) e `checklists` (M5.2) — os dois consumidores reais que justificam a feature-folha.
```

### M4.5

**Título:** [M4.5] Importar planilha de Empresas (`/empresas/importar`): .xlsx (lazy) e .csv, prévia por linha, confirmação e relatório
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/ImportCompaniesPage.vue` (575 linhas): dropzone + input de arquivo, `.xlsx` convertido no browser com `import('xlsx')` (primeira aba, `sheet_to_csv({ rawNumbers: true })`), `.csv` lido direto, cabeçalhos PT aceitos pela API, `importCsv` devolve `ImportPreviewResult` (linhas válidas/inválidas com motivo), opção "ativar as importadas", `confirmImport(pending, activate)` com `ImportResult` por linha, link para o modelo.

## Alvo (React)

`features/companies/components/{import-companies-page,spreadsheet-dropzone,import-preview-table,import-report}.tsx`. Leitura do arquivo é uma função pura `readSpreadsheet(file): Promise<{csv, fileName}>` em `features/companies/utils/spreadsheet.ts` (testável; o `import('xlsx')` continua lazy). Estado da tela é uma máquina simples em `useReducer`: `idle → reading → previewing → confirming → done`, com `error`. A dropzone fica dentro de `react-error-boundary` (parser de terceiros é widget de risco).

## Critérios de aceite

- [ ] Screenshots: inicial, prévia com erros por linha, relatório final — comparados ao baseline.
- [ ] Teste: `.xlsx` de duas abas só lê a primeira; extensão desconhecida mostra "Envie um arquivo .csv ou .xlsx."
- [ ] O chunk do `xlsx` não entra no bundle inicial (`vite build` lista um chunk separado carregado só nesta rota).
- [ ] Confirmar invalida `companyKeys.lists()` e `usage()`.
```

---

## E5 — Checklists (templates)

**Título:** [E5] Checklists: templates do produto e derivados editáveis
**Labels:** `migration-react`, `web`
**Prioridade:** Medium
**Descrição:**

```markdown
`features/checklists`. Marco: derivar um template do produto, editar itens, renomear e excluir no preview, com o guard de saída funcionando.
```

### M5.1

**Título:** [M5.1] `features/checklists`: api, key factory e hooks de templates e itens
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** P
**Descrição:**

```markdown
## Origem (Vue)

`features/checklists/api/checklists.ts` (menos `getTemplates`/`getDocumentTypes`, que foram para `catalog` no M4.4) e `composables/useChecklistsFeature.ts`.

## Alvo (React)

`api/{get-template,create-template,rename-template,derive-template,delete-template,add-template-item,update-template-item,remove-template-item}.ts`; `queries/template-keys.ts` (`templateKeys.all/details()/detail(id)`); hooks `useTemplate(id)`, `useCreateTemplate` (invalida `catalogKeys.templates()`), `useRenameTemplate` (detail + `catalogKeys.templates()`), `useDeriveTemplate` (`catalogKeys.templates()`), `useDeleteTemplate` (`catalogKeys.templates()` + remove `detail(id)`), `useAddTemplateItem`/`useUpdateTemplateItem`/`useRemoveTemplateItem` (detail).

Observação: `checklists` invalida uma key de `catalog` — isso é import de `catalog` (permitido) e é o motivo de `templates()` morar lá.

## Critérios de aceite

- [ ] Testes de invalidação por mutation.
- [ ] Nenhum `queryKey` literal fora de `template-keys.ts`.
```

### M5.2

**Título:** [M5.2] Lista de templates (`/templates`) e editor (`/templates/:id`): itens, derivar, renomear, excluir e guard de saída com alterações não salvas
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/ChecklistsListPage.vue` (237 linhas: templates do produto vs. da Contabilidade, "empresas usando", derivar com nome, excluir com confirmação), `pages/ChecklistFormPage.vue` (601 linhas: nome editável com validação "nome vazio pede o nome" COM-265, lista de itens com periodicidade/prazo/obrigatório/formatos, lixeira nomeada por item COM-270, adicionar pelo `CatalogPicker`, diálogos com "Fechar" COM-271, `onBeforeRouteLeave` quando há item em edição, templates do produto são somente leitura).

## Alvo (React)

`features/checklists/components/{checklists-list-page,derive-template-dialog,template-editor-page,template-item-row,template-item-form}.tsx`. Guard de saída com `useBlocker(hasUnsavedChanges)` + diálogo "Sair sem salvar?" e `beforeunload` (único `useEffect` aceito aqui: sincroniza com o evento do navegador). "Há alterações" é derivado do `formState.isDirty` do item em edição. Edição de item: RHF com `CreateTemplateItemBody` de `@competa/contracts`.

## Critérios de aceite

- [ ] Screenshots: lista, editor de template do produto (somente leitura), editor derivado com item em edição, diálogo de saída — comparados ao baseline.
- [ ] Teste: salvar com nome vazio mostra o erro no campo e **não** mostra "Template salvo." (regressão COM-265).
- [ ] Teste: com item em edição, navegar para `/templates` abre o diálogo; "Ficar" mantém a rota.
- [ ] Derivar navega para `/templates/:novoId` e a lista de templates é invalidada.
```

---

## E6 — Mensagens

**Título:** [E6] Mensagens: log de entrega e reenvio
**Labels:** `migration-react`, `web`
**Prioridade:** Medium
**Descrição:**

```markdown
`features/messages`. Marco: filtrar por Empresa/canal/tipo com a URL compartilhável e reenviar uma mensagem no preview.
```

### M6.1

**Título:** [M6.1] Log de Mensagens (`/mensagens`): filtros por Empresa, canal e tipo na URL, paginação, detalhe do erro e reenvio por mensagem
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/MessagesPage.vue` (252 linhas), `features/messages/api/messages.ts` (`getMessages(MessageListQuery)`, `resendMessage`). Filtros `companyId`, `channel`, `purpose` sincronizados com a paginação (aplicados no banco), detalhe do erro de entrega por linha, "Reenviar mensagem" (`POST /messages/:id/resend`), portada para o Vue em 2026-11-01 (COM-253).

## Alvo (React)

`features/messages/{api,queries/message-keys.ts,queries/use-messages.ts,queries/use-resend-message.ts,components/{messages-page,messages-filters,messages-table,delivery-error}.tsx}`. `messageKeys.list(query: MessageListQuery)`; a query inteira vem de `useSearchParams` parseada com o schema `MessageListQuery` de `@competa/contracts` (valores inválidos caem no default). Mudar filtro reseta `page` para 1 **na mesma escrita da URL**. O select de Empresa usa `useCompaniesOptions()` — **não existe** em `catalog`; usar `GET /companies?perPage=100&active=true` por um hook local `useCompanyFilterOptions()` em `features/messages/queries` com a key `messageKeys.companyOptions()`. Reenvio: `useResendMessage` invalida `messageKeys.lists()`; o canal de saída é o da mensagem (WhatsApp sai por WhatsApp — teste da API `reenvio…sai pelo whatsapp`).

## Critérios de aceite

- [ ] Screenshots: sem filtro, com filtros e página 2, linha com erro aberto — comparados ao baseline.
- [ ] Teste: `?canal=whatsapp&page=3` → mudar `tipo` resulta em `?canal=whatsapp&tipo=…&page=1`.
- [ ] Teste: URL com `page=abc` cai em `page=1` sem quebrar.
- [ ] Reenviar mostra toast e refaz a lista.
```

---

## E7 — Configurações

**Título:** [E7] Configurações: Contabilidade, Contadores, WhatsApp e Plano
**Labels:** `migration-react`, `web`
**Prioridade:** Medium
**Descrição:**

```markdown
Quatro telas sob `/configuracoes/*`, cada uma na própria feature (`firm`, `team`, `whatsapp`, `billing`). Regra transversal: membro (não dono) vê Contabilidade, Plano e WhatsApp em somente leitura, com aviso no topo.
```

### M7.1

**Título:** [M7.1] Configurações → Contabilidade (`/configuracoes/contabilidade`): nome, CNPJ, e-mail de contato, logotipo e preferências de lembrete (dono edita, membro só lê)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/FirmSettingsPage.vue` (294 linhas), `features/firm/api/firm.ts` (`GET/PATCH /accounting-firm`, `UpdateFirmBody`). Campos: `name`, `contactEmail`, `cnpj`, `logoUrl`, `reminderMax`, `reminderDueSoonDays`, `reminderGapDays`; `canTuneReminders = can('reminderTuning')` (gate de plano, com `PlanGateNotice`); `isOwner` desabilita salvar para membro; `remindersInEffect` mostra o que está valendo; `watch` para carregar o form.

## Alvo (React)

`features/firm/{api,queries/firm-keys.ts,queries/{use-firm,use-update-firm}.ts,components/{firm-settings-page,firm-form,reminders-fieldset,read-only-notice}.tsx}`. Form monta após `useFirm()` resolver com `key={firm.updatedAt ?? 'firm'}` e `defaultValues` (sem `useEffect`+`reset`). `useUpdateFirm` invalida `firmKeys.detail()` **e** `authKeys.me()` (o nome da firma aparece no layout). `ReadOnlyNotice` para membro é um componente em `shared/components` se o M7.3/M7.4 também usarem (três consumidores: promover então).

## Critérios de aceite

- [ ] Screenshots como dono e como membro — comparados ao baseline.
- [ ] Teste: salvar como dono envia `PATCH` e o nome muda no `PanelLayout` sem reload (invalidação do `me`).
- [ ] Teste: membro vê campos desabilitados e o aviso; `PlanGateNotice` aparece sem `reminderTuning`.
```

### M7.2

**Título:** [M7.2] Configurações → Contadores (`/configuracoes/contadores`): equipe, remover (nunca o dono), convites pendentes, criar e revogar convite (só dono)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/AccountantsSettingsPage.vue` (297 linhas), `features/team/api/team.ts`, `composables/useAccountants.ts`. `GET /accountants`, `DELETE /accountants/:id` (422 `CANNOT_REMOVE_OWNER`), `GET/POST/DELETE /invites` (403 `ONLY_OWNER_CAN_INVITE`), URL do convite copiável, 3 diálogos de confirmação, 5 toasts.

## Alvo (React)

`features/team/{api,queries/team-keys.ts,queries/{use-accountants,use-pending-invites,use-create-invite,use-remove-accountant,use-revoke-invite}.ts,components/{accountants-settings-page,accountants-table,invites-table,invite-form,confirm-dialog}.tsx}`. Rota só acessível pelo menu do dono (já é assim), mas a tela em si trata 403 com `ErrorState`. `useCreateInvite` invalida `teamKeys.invites()`; `useRemoveAccountant` invalida `teamKeys.accountants()`.

## Critérios de aceite

- [ ] Screenshots: equipe com convites pendentes, formulário de convite, diálogos — comparados ao baseline.
- [ ] Teste: criar convite mostra a URL com botão copiar e refaz a lista de convites.
- [ ] Teste: remover o dono mostra a mensagem do 422 do servidor (não uma genérica).
```

### M7.3

**Título:** [M7.3] Configurações → WhatsApp (`/configuracoes/whatsapp`): status, conectar (onboard), envio de teste e desconectar
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Low
**Estimativa:** P
**Descrição:**

```markdown
## Origem (Vue)

`pages/WhatsAppSettingsPage.vue` (265 linhas; chama `api` direto — isso **não** se repete): `GET /whatsapp/status` em `onMounted`, `POST /whatsapp/onboard` (`code: 'mock_code'` hoje; o Embedded Signup real da Meta é Fase 8), `POST /whatsapp/test` (telefone), `DELETE /whatsapp`. Dono conecta/desconecta; qualquer membro pode testar.

## Alvo (React)

`features/whatsapp/{api,queries/whatsapp-keys.ts,queries/{use-whatsapp-status,use-onboard-whatsapp,use-test-whatsapp,use-disconnect-whatsapp}.ts,components/{whatsapp-settings-page,test-message-form}.tsx}`. O status é `useQuery` (some o `onMounted`). Onboard/disconnect invalidam `whatsappKeys.status()`.

## Critérios de aceite

- [ ] Screenshots: não conectado, conectado, teste enviado — comparados ao baseline.
- [ ] Teste: membro vê conectar/desconectar desabilitados e consegue enviar teste.
- [ ] Nenhuma chamada a `api.*` fora de `features/whatsapp/api`.
```

### M7.4

**Título:** [M7.4] Configurações → Plano e Assinatura (`/configuracoes/plano`): status/trial, ciclo mensal/anual, preço com override, checkout (redirect ao Asaas), fatura em aberto, cancelar, `?plano=`
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/PlanPage.vue` (529 linhas), `features/billing/api/billing.ts` (`getSubscription`, `checkout(CheckoutBody)`, `cancelSubscription`), `PLANS`/`PAID_PLANS`/`planPrice` de `@competa/contracts`. `highlighted` vem de `?plano=` (default `profissional`), `cycle` local, `priceOverride` da assinatura, rótulo de status (trial ativo/expirado, ativa, pendente, cancelada até X), checkout exige CNPJ gravado (senão manda para Contabilidade), `window.location.href = checkoutUrl`, `invoiceUrl` para fatura em aberto, cancelar com confirmação, membro em somente leitura.

## Alvo (React)

`features/billing/{api,queries/billing-keys.ts,queries/{use-subscription,use-checkout,use-cancel-subscription}.ts,components/{plan-page,plan-card,subscription-status,cancel-dialog}.tsx}`. `?plano=` e `?ciclo=` na URL. Rótulos de status derivados no render. `useCheckout` no sucesso redireciona; `useCancelSubscription` invalida `billingKeys.subscription()` e `authKeys.me()` (o `isOverdue` do layout depende disso). Validar `checkoutUrl`/`invoiceUrl` com `new URL()` aceitando só `https:` e host terminando em `.asaas.com` antes de redirecionar/renderizar (fecha o item T3-4 da auditoria de novembro, por custo zero).

## Critérios de aceite

- [ ] Screenshots: trial ativo, trial expirado, ativa, pendente com fatura, cancelada, visão de membro — comparados ao baseline (usar os estados do seed/staging; os que não existirem viram MSW no teste).
- [ ] Teste: checkout sem CNPJ não chama a API e mostra o aviso com link para Contabilidade.
- [ ] Teste: `checkoutUrl` com host fora de `.asaas.com` não redireciona e loga erro.
- [ ] `?plano=essencial` destaca o card certo no primeiro render (sem efeito).
```

---

## E8 — Envio público e PWA

**Título:** [E8] Envio público (`/envio/:token`) e PWA (instalação, push, device)
**Labels:** `migration-react`, `web`
**Prioridade:** High
**Descrição:**

```markdown
A única porta obrigatória do produto (D14): a página sem senha onde o Responsável manda os documentos. Mais a casca PWA (instalar, avisos push, ping do dispositivo) que o `/envio` e a área do Responsável compartilham. Marco: enviar arquivos por link no celular (preview) e ativar avisos.
```

### M8.1

**Título:** [M8.1] `shared/pwa`: store de instalação (Zustand), `usePush`, ping do dispositivo, `InstallButton`, manifest e `push-handler.js`
**Labels:** `migration-react`, `web`, `foundation`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`composables/usePwaInstall.ts` (refs de módulo + `beforeinstallprompt`/`appinstalled`, `getDeviceId` em `localStorage`, `pingOnce` em `sessionStorage` → `PATCH /auth/device`), `composables/usePush.ts` (`GET /push/vapid-key`, `Notification.requestPermission`, `serviceWorker.ready` com timeout de 10 s, `pushManager.subscribe`, `save(payload)` injetado), `components/InstallButton.vue` (144 linhas, variantes `card`/inline, dica iOS), `public/push-handler.js`, `public/manifest.webmanifest`.

## Alvo (React)

- `shared/pwa/install.store.ts`: Zustand `{ deferredPrompt, isStandalone, isIos, platform }` com seletores derivados `canInstall`, `showIosHint`; os listeners de `window` são registrados **uma vez no módulo** (sincronização com sistema externo; não em `useEffect` de componente). Ação `promptInstall()`.
- `shared/pwa/device.ts`: `getDeviceId()` e `pingDeviceOnce()` como funções puras sobre `localStorage`/`sessionStorage` + `api.patch('/auth/device')`; chamadas por `usePingDevice()` (uma `useMutation` disparada no layout da área do Responsável, uma vez por sessão — a guarda é o `sessionStorage`, não um efeito).
- `shared/pwa/use-push.ts`: `useQuery(pwaKeys.vapidKey())` (`staleTime: 'static'` — não muda durante a vida do app, é config de boot) + `useQuery(pwaKeys.subscription())` que lê `pushManager.getSubscription()` + `useMutation` `subscribe(save)` que invalida `pwaKeys.subscription()`. Toasts idênticos ("Avisos ligados neste aparelho.", "As notificações ficaram bloqueadas neste aparelho.").
- `shared/pwa/install-button.tsx` portado.
- `public/push-handler.js` e `manifest.webmanifest` **copiados sem alteração** (o payload da API ainda vem no formato `{ notification }`).

## Critérios de aceite

- [ ] Teste: sem service worker, `subscribe` desiste em 10 s com erro (timer fake).
- [ ] Teste: `pingDeviceOnce` chama a API uma vez por sessão e desfaz a marca se falhar.
- [ ] Teste: `canInstall` é `false` em standalone mesmo com `deferredPrompt`.
- [ ] `InstallButton` na galeria `/__ui` nas duas variantes e com a dica iOS.
```

### M8.2

**Título:** [M8.2] `features/upload`: api do fluxo de envio (checklist por token, presign, PUT no storage, confirm, push, ativar acesso) e hook `useUpload` puro e testado
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`features/upload/api/upload.ts` (`getChecklist(token)`, `presignFiles`, `putFileToStorage` com progresso via XHR, `confirmFiles`, `subscribePush`, `activateAccess`), `composables/useUpload.ts` (140 linhas: presign → PUT sequencial com progresso → confirm; resultados por arquivo `FileResult` com `retriable`; falha de presign/confirm derruba o lote com mensagem neutra, sem vazar campo de API), `scripts/check-upload.ts` (casos de teste), `features/upload/composables/useUploadFeature.ts`.

## Alvo (React)

- `features/upload/api/*.ts` um por chamada; `putFileToStorage` continua XHR (progresso) e é o único `fetch`/XHR fora do api-client permitido pelo lint.
- `features/upload/queries/upload-keys.ts` (`uploadKeys.checklist(token)`), `use-upload-checklist.ts`, `use-subscribe-push.ts`, `use-activate-access.ts` (no sucesso invalida `authKeys.all` — a sessão nasce no `Set-Cookie`).
- `features/upload/hooks/use-upload.ts`: **a mesma máquina** do Vue, com `useReducer` (`start`, `fileAuthorized`, `progress`, `fileSent`, `fileFailed`, `batchFailed`, `done`) e `percent` derivado; recebe `deps` injetadas (presign/send/confirm) para ser testável; expõe `uploadFiles(files)`, `isUploading`, `percent`, `results`. Ao concluir, invalida `uploadKeys.checklist(token)`.
- `use-upload.spec.ts` porta **todos** os casos de `check-upload.ts` com `renderHook`.

## Critérios de aceite

- [ ] `use-upload.spec.ts` passa com os casos do Vue: presign 422 → todos `retriable` com mensagem neutra; PUT falha em um arquivo → só ele `retriable`; confirm recusa um → ele `ok: false` com o motivo do servidor e os outros `ok: true`.
- [ ] O progresso agregado nunca passa de 100 e soma os arquivos recusados no presign como "enviados" (comportamento atual).
- [ ] Nenhum estado do upload fora do hook (nada em Zustand).
```

### M8.3

**Título:** [M8.3] Página pública de envio (`/envio/:linkToken`): mobile-first, itens com status/prazo/motivo da rejeição, drag-and-drop e câmera, documentos extras, feedback por arquivo, ofertas "Ativar avisos" e "Ativar acesso"
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** G
**Descrição:**

```markdown
## Origem (Vue)

`pages/UploadPage.vue` (684 linhas): `getChecklist(token)` com estados `gone`/`offline`/`server` (`failureKind`) e "link expirado" com caminho para `/perdi-meu-link`; por Item: nome, status (`displayItemStatus`), prazo (`DueDate`), arquivos já enviados **só com** nome/status/motivo (regra 3 do AGENTS.md), dropzone por Item e dropzone de extras (`requestItemId: null`), `<input capture="environment">` para câmera, `UploadFeedback` com retry dos `retriable`; tela de sucesso com `InstallButton` e os dois botões (push via `subscribePush(token)`, acesso via `activateAccess` → sessão de contato → link para `/minha-area`).

## Alvo (React)

`features/upload/components/{upload-page,upload-header,upload-item,dropzone,upload-feedback,success-offers}.tsx` com `PublicLayout`. `Dropzone` (sem lib; `onDrop`/`onDragOver` + `<input type="file" multiple>`; `accept` vindo dos formatos do item) dentro de `react-error-boundary`. Os arquivos selecionados antes do envio são `useState` local do item. Toda a página é mobile-first (compara com `envio__mobile`).

## Critérios de aceite

- [ ] Screenshots mobile e desktop: checklist com pendências, com rejeição, enviando (progresso), sucesso com as ofertas, link expirado — comparados ao baseline.
- [ ] Teste (MSW): o handler de `GET /upload/:token` **não** contém `storageKey`, `downloadUrl` nem conteúdo, e a tela renderiza sem eles (invariante de segurança).
- [ ] Teste: arquivo recusado no confirm aparece com o motivo e botão "Tentar de novo" só nos `retriable`.
- [ ] Teste: "Ativar acesso" invalida a sessão e o link para `/minha-area/pendencias` aparece.
- [ ] Acessibilidade: dropzone operável por teclado (botão "Escolher arquivos"), `aria-live` no progresso, status com ícone + texto.
```

---

## E9 — Área do Responsável

**Título:** [E9] Área do Responsável (`/minha-area/*`) e "Perdi meu link"
**Labels:** `migration-react`, `web`
**Prioridade:** Medium
**Descrição:**

```markdown
`features/contact-area`: entrada (senha e magic link), definir senha, pendências com envio logado, histórico com preview/baixar, multi-empresa com badge, e o fluxo "Perdi meu link" em 2 passos. Marco: entrar por magic link, enviar um documento logado e baixar um do histórico no preview.
```

### M9.1

**Título:** [M9.1] `ContactLayout` e `features/contact-area`: api, key factory e hooks (pendências, períodos, detalhe, envio logado, documentos)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`layouts/ContactLayout.vue` (107 linhas: cabeçalho com nome da Contabilidade, badge "N empresas" quando multi-empresa, `InstallButton` card, sair → `/minha-area/acesso`), `features/contact-area/api/index.ts` (`getMyPending`, `presignMyDocuments`, `confirmMyDocuments`, `getMyPeriods(page, perPage)`, `getMyPeriod(periodId, companyId)`, `openMyDocument`, `downloadMyDocument`), `composables/{useContactPending,useContactHistory}.ts`.

## Alvo (React)

`shared/components/layout/contact-layout.tsx` (lê `useSession().contact`; `usePingDevice()` de `shared/pwa`). `features/contact-area/{api,queries/contact-keys.ts,queries/{use-my-pending,use-my-periods,use-my-period,use-my-document}.ts}` com `contactKeys = { all: ['contact-area'], pending(), periods(page), period(periodId, companyId), document(id) }`. Confirmar envio invalida `contactKeys.pending()` e `periods()`.

## Critérios de aceite

- [ ] Screenshot do layout (uma e várias empresas) comparado ao baseline.
- [ ] Testes de invalidação.
- [ ] Sair limpa o cache inteiro e vai para `/minha-area/acesso`.
```

### M9.2

**Título:** [M9.2] Entrada do Responsável (`/minha-area/acesso`: senha e magic link) e definir senha (`/minha-area/definir-senha`)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/ContactSignInPage.vue` (203 linhas; dois formulários: e-mail+senha → `signInContact`, e-mail → `sendMagicLink(email, callbackURL)` com confirmação "enviamos"; texto explicando que o link de envio chega por e-mail), `pages/ContactSetPasswordPage.vue` (130 linhas; `setContactPassword`; `hasPassword` do perfil decide o texto; volta para `/minha-area/pendencias`).

## Alvo (React)

`features/contact-area/components/{contact-sign-in-page,password-form,magic-link-form,set-password-page}.tsx` com `useSignInContact`, `useSendMagicLink`, `useSetContactPassword` (M1.1). Dois RHF independentes. `GuestOnly` na entrada.

## Critérios de aceite

- [ ] Screenshots: entrada, "link enviado", definir senha — comparados ao baseline.
- [ ] Teste: senha errada mostra "E-mail ou senha inválidos."; magic link mostra a confirmação e não revela se o e-mail existe.
- [ ] Teste: após definir senha, `authKeys.contactProfile()` é invalidada e `hasPassword` muda.
```

### M9.3

**Título:** [M9.3] Pendências do Responsável (`/minha-area/pendencias`): itens agrupados por Empresa/Competência, envio logado com `useUpload`, avisos push
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/ContactPendingPage.vue` (194 linhas): `getMyPending` → agrupamento por `companyId`+`periodId` (derivado), `useUpload` com deps `presignMyDocuments`/`putFileToStorage`/`confirmMyDocuments(requestId, ids)`, `UploadFeedback`, botão de push salvando via rota logada.

## Alvo (React)

`features/contact-area/components/{contact-pending-page,pending-group,logged-upload}.tsx`. Reusa `useUpload` e `Dropzone`/`UploadFeedback` de… **atenção**: esses vivem em `features/upload`, e `contact-area` não pode importar `upload`. Mover `use-upload.ts`, `dropzone.tsx` e `upload-feedback.tsx` para `shared/upload/` no início deste ticket (dois consumidores reais: `/envio` e `/minha-area`) — eles são domínio-neutros (recebem deps). Atualizar o M8.x que já usou. `putFileToStorage` vai junto para `shared/upload/put-file.ts`.

## Critérios de aceite

- [ ] Screenshots: vazio ("tudo em dia"), com pendências em duas Empresas, enviando — comparados ao baseline.
- [ ] Teste: confirmar envio invalida `contactKeys.pending()` e o item some do grupo.
- [ ] `features/upload` e `features/contact-area` importam o hook de `shared/upload`; lint verde.
```

### M9.4

**Título:** [M9.4] Histórico do Responsável (`/minha-area/competencias`): competências paginadas, detalhe por Empresa, preview e baixar documento
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** M
**Descrição:**

```markdown
## Origem (Vue)

`pages/ContactHistoryPage.vue` (253 linhas): `getMyPeriods` paginado, expandir período → `getMyPeriod(periodId, companyId)` com documentos, `openMyDocument` (preview) e `downloadMyDocument` (`GET /my/documents/:id/content`), contadores entregues/pendentes.

## Alvo (React)

`features/contact-area/components/{contact-history-page,period-card,period-documents}.tsx`. `?page=` na URL; período expandido em `?periodo=` (compartilhável). Preview reusa o `DocumentPreview` — que está em `features/periods` (M3.1). Mover `document-preview.tsx` para `shared/components` (dois consumidores) neste ticket; ele recebe a função `open(): Promise<{objectUrl, type}>` como prop.

## Critérios de aceite

- [ ] Screenshots: lista, período expandido, preview — comparados ao baseline.
- [ ] Teste: expandir chama `GET /my/periods/:id?companyId=` uma vez e cacheia ao recolher/expandir.
- [ ] Baixar com blob vazio mostra "Nenhum documento para baixar."
```

### M9.5

**Título:** [M9.5] "Perdi meu link" em 2 passos (`/perdi-meu-link`, `/perdi-meu-link/confirmar`): resposta cega e confirmação por botão (nunca no load)
**Labels:** `migration-react`, `web`, `Feature`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** P
**Descrição:**

```markdown
## Origem (Vue)

`pages/RecoverLinkPage.vue` (124 linhas; e-mail → `POST /access/recover`, mensagem idêntica para qualquer e-mail, limite 3/min tratado como erro genérico), `pages/RecoverLinkConfirmPage.vue` (92 linhas; lê `?token=`; **botão** "Confirmar e reenviar" chama `POST /access/recover/confirm` — jamais auto-dispara no load, para scanner de e-mail não matar o link vivo; estados sucesso / token inválido).

## Alvo (React)

`features/contact-area/components/{recover-link-page,recover-link-confirm-page}.tsx` com `useRecoverLink`, `useConfirmRecoverLink` (M1.1). O token vem de `useSearchParams`.

## Critérios de aceite

- [ ] Screenshots dos dois passos e dos estados finais — comparados ao baseline.
- [ ] Teste: a página de confirmação **não** chama a API ao montar; só no clique (regressão AUTHZ-3).
- [ ] Teste: sucesso, e-mail desconhecido e Responsável sem acesso mostram **a mesma** mensagem no passo 1; o 429 (limite de 3/min) mostra a mensagem de erro que o Vue mostra hoje (conferir em `RecoverLinkPage.vue` antes de implementar e copiar o texto).
```

---

## E10 — Qualidade e cutover

**Título:** [E10] Qualidade, paridade e cutover para produção
**Labels:** `migration-react`, `web`
**Prioridade:** High
**Descrição:**

```markdown
Fechar a migração: testes de fluxo ponta a ponta com MSW, auditoria de acessibilidade e paridade visual, verificação do PWA em build de produção, orçamento de performance, e a troca `apps/web-react` → `apps/web` com remoção do Vue e atualização dos docs.
```

### M10.1

**Título:** [M10.1] Testes de fluxos críticos (MSW): entrar → abrir competência → painel → revisão; envio público; cadastro → trial
**Labels:** `migration-react`, `web`, `Chore`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## O que fazer

Três specs de integração em `src/testing/flows/`, montando o router real com `createMemoryRouter` e os handlers MSW:

1. `accountant-flow.spec.tsx`: login → `/competencias` vazio → abrir competência (modal, prévia, resumo) → painel de pendências → copiar link → abrir revisão → aceitar um item → voltar e ver o painel atualizado (invalidação funcionando de ponta a ponta).
2. `public-upload-flow.spec.tsx`: `/envio/:token` → dois arquivos (um recusado no confirm) → feedback → "Ativar avisos" (service worker mockado) → "Ativar acesso" → link para `/minha-area`.
3. `register-flow.spec.tsx`: `/cadastro` dois passos → `/competencias` com o banner de trial.

Testar **comportamento** (o que o usuário vê e o que a API recebe), não implementação.

## Critérios de aceite

- [ ] As três specs passam no CI em menos de 30 s somadas.
- [ ] Cada spec afirma pelo menos uma invalidação observável (lista refeita após mutation).
```

### M10.2

**Título:** [M10.2] Auditoria de acessibilidade e paridade visual de todas as telas contra o baseline (M0.1)
**Labels:** `migration-react`, `web`, `Chore`, `ready-for-agent`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## O que fazer

1. Repetir o Prompt C contra o app React (mesmas rotas, viewports e estados) em `docs/qa/baseline-react-2026-11/`.
2. Montar um `docs/qa/parity-report.md` com uma linha por imagem: igual / diferença aceitável (explicar) / regressão (abrir ticket).
3. Checagem estrutural de a11y nas telas densas (igual à feita no Vue, `docs/frontend-status.md` → Acessibilidade): todo controle com nome acessível, todo campo com `label`, sem `id` duplicado, sem salto de heading, um `h1` por página, status nunca só por cor. Rodar `axe-core` (via `@axe-core/playwright`) em cada rota do baseline e anexar o resultado.
4. `check:wcag` e `check:no-diamond` verdes.

## Critérios de aceite

- [ ] `parity-report.md` sem linha "regressão" aberta (ou cada uma com ticket linkado).
- [ ] Zero violações `serious`/`critical` do axe em todas as rotas.
```

### M10.3

**Título:** [M10.3] PWA em build de produção: service worker ativo, casca offline, `push-handler` recebendo push e manifest instalável
**Labels:** `migration-react`, `web`, `Chore`, `ready-for-human`
**Prioridade:** Medium
**Estimativa:** P
**Descrição:**

```markdown
## O que fazer

Com `pnpm --filter web-react build && preview` (ou o preview do Pages):

- [ ] SW registrado; recarregar `/minha-area/pendencias` offline abre a casca (não cacheia resposta de API — nada de `dataGroups`).
- [ ] Instalável (Chrome Android e desktop): manifest válido, `start_url` `/minha-area/pendencias`, ícones 192/512 e maskable.
- [ ] Push de teste (via `POST /upload/:token/push` + um envio da API em staging) chega e o clique abre a URL do payload (`push-handler.js` intacto).
- [ ] iOS: a dica de instalação aparece no Safari e some em standalone.
      Registrar o resultado em `docs/frontend-status.md` (seção PWA), trocando as menções ao Vue.
```

### M10.4

**Título:** [M10.4] Orçamento de performance: chunks por rota, `xlsx` fora do bundle inicial, Lighthouse ≥ 90 em `/entrar`, `/envio/:token` e `/competencias`
**Labels:** `migration-react`, `web`, `Chore`, `ready-for-agent`
**Prioridade:** Medium
**Estimativa:** P
**Descrição:**

```markdown
## O que fazer

- `vite build` com `--reportCompressedSize`; anotar o bundle inicial (JS gzip) e compará-lo ao do Vue (`apps/web`); meta: igual ou menor.
- Confirmar que cada rota é um chunk e que `xlsx` e `sonner`-pesados não estão no inicial.
- Lighthouse (mobile) nas três rotas: Performance e Accessibility ≥ 90.
- Se algo exigir `memo`/`useMemo`, **medir antes** com o Profiler e registrar o motivo no PR (regra do padrão: nada de memoização preventiva).
- Registrar os números em `docs/frontend-status.md`.

## Critérios de aceite

- [ ] Tabela com os números no PR e no doc.
- [ ] Nenhum `memo(`/`useMemo(`/`useCallback(` sem um comentário `ponytail:` citando a medição (única forma de comentário aceita para isso).
```

### M10.5

**Título:** [M10.5] Cutover: `apps/web-react` vira `apps/web`, remover o Vue, atualizar CI, deploy, docs e AGENTS.md
**Labels:** `migration-react`, `web`, `foundation`, `Chore`, `ready-for-human`
**Prioridade:** High
**Estimativa:** M
**Descrição:**

```markdown
## Pré-condições

Todos os tickets M1–M9 em Done; M10.1–M10.4 em Done; preview `competa-web-react-staging` aprovado pelo Luca.

## O que fazer

1. Branch `chore/cutover-react`: `git mv apps/web apps/web-vue-legacy` (só para o diff ficar legível), `git mv apps/web-react apps/web`, renomear o pacote para `web`, remover os `Placeholder` de rota e a galeria `/__ui` (ou deixá-la só em DEV, se útil).
2. Apagar `apps/web-vue-legacy` no mesmo PR (o histórico fica no git).
3. CI: remover o job `deploy-web-react-staging`; `deploy-web` e `deploy-web-staging` passam a buildar o React (mesmos projetos `competa-web` e `competa-web-staging`). Remover `vue-tsc` de qualquer referência.
4. Raiz: `package.json` (`dev` volta a ser só `pnpm -r --parallel run dev`), `lint-staged`, `eslint.config.mjs` (o bloco do web-react vira o bloco do web; apagar `**/.angular` e menções a Vue).
5. Docs (mesma PR, regra do AGENTS.md): `AGENTS.md` ("Um paradigma por app": `apps/web` = React 19, hooks e features; Stack; regra 9 Styling cita shadcn/ui em vez de reka-ui; regra 10 cita React Hook Form), `docs/architecture.md`, `docs/conventions.md`, `docs/frontend-status.md` (tabela de telas aponta para os arquivos React), `docs/deploy.md` (remover o preview), `docs/react-standards.md` vira o doc normativo linkado em "Como o Luca gosta de trabalhar".
6. **Humano:** deletar o projeto `competa-web-react-staging` no Pages e tirar sua origem de `TRUSTED_ORIGINS` da API de staging; merge em `staging`, validar, merge em `main`.
7. Fechar o épico raiz com um comentário resumindo: bundle antes/depois, número de testes, telas, e o que ficou de fora.

## Critérios de aceite

- [ ] `pnpm -r build`, `pnpm lint`, `pnpm --filter web test` verdes.
- [ ] `grep -ri "vue" apps/ libs/ docs/ AGENTS.md` só retorna menções históricas deliberadas (changelog/decisions).
- [ ] Produção em `app.competa.com.br` servindo o React; smoke manual: entrar, abrir competência, `/envio/:token` no celular.
```

---

## Relações (aplicar depois de criar tudo — todas "blocked by")

| Ticket                       | Bloqueado por                                 |
| ---------------------------- | --------------------------------------------- |
| M0.3, M0.4, M0.5, M0.7, M0.9 | M0.2                                          |
| M0.6                         | M0.5                                          |
| M0.8                         | M0.7                                          |
| M0.10                        | M0.9                                          |
| M1.1                         | M0.6, M0.9                                    |
| M1.2, M1.3, M1.4, M1.5       | M1.1, M0.8                                    |
| M2.1                         | M1.1, M0.8                                    |
| M2.2                         | M0.5                                          |
| M2.3                         | M2.1, M2.2                                    |
| M2.4                         | M2.3                                          |
| M3.1                         | M2.4                                          |
| M4.1                         | M0.5                                          |
| M4.4                         | M4.1, M2.1                                    |
| M4.2                         | M4.1, M4.4, M2.1                              |
| M4.3                         | M4.1, M2.1                                    |
| M4.5                         | M4.1, M2.1                                    |
| M5.1                         | M4.4                                          |
| M5.2                         | M5.1, M2.1                                    |
| M6.1                         | M2.1, M4.1                                    |
| M7.1, M7.2, M7.3, M7.4       | M2.1                                          |
| M8.1                         | M0.8                                          |
| M8.2                         | M0.5                                          |
| M8.3                         | M8.1, M8.2, M1.1                              |
| M9.1                         | M1.1, M8.1                                    |
| M9.2, M9.5                   | M9.1                                          |
| M9.3                         | M9.1, M8.3                                    |
| M9.4                         | M9.1, M3.1                                    |
| M10.1                        | M3.1, M8.3, M1.3                              |
| M10.2                        | M9.5, M7.4, M6.1, M5.2, M4.5 (todas as telas) |
| M10.3                        | M8.3, M9.3                                    |
| M10.4                        | M10.2                                         |
| M10.5                        | M10.1, M10.2, M10.3, M10.4                    |

M0.1 não bloqueia nada formalmente, mas é citado nos critérios de aceite de toda tela; crie-o primeiro e marque como **High**.

## Totais esperados

- 1 épico raiz, 11 épicos (E0–E10), **45 tickets**.
- Por épico: E0 10 · E1 5 · E2 4 · E3 1 · E4 5 · E5 2 · E6 1 · E7 4 · E8 3 · E9 5 · E10 5.
- Prioridade: Urgent 5 (M1.1, M2.1, M2.2, M2.3, M2.4) · High 24 · Medium 15 · Low 1 (M7.3).
- Estimativa: P 11 · M 24 · G 10.
- `ready-for-human`: M0.1, M0.10, M10.3, M10.5. Todos os outros 41 são `ready-for-agent`.

---

# Seção 3 — Prompts de execução

## Prompt B — Executar a migração inteira, ticket a ticket, em sequência

> **Cole o bloco abaixo no agente que vai implementar.** É uma sessão longa (ou várias retomadas): o agente percorre os 45 tickets na ordem das dependências, um de cada vez, e só avança quando o anterior está verde. Ele precisa de acesso ao repositório `pygmuslabs/competa`, ao Linear e a um terminal com Docker (para o M0.1). Se a sessão cair, cole o mesmo prompt de novo: o passo 0 retoma do ponto onde parou.

```text
Você é um engenheiro React sênior trabalhando no repositório Competa (monorepo pnpm). Sua missão é executar TODA a migração do `apps/web` de Vue 3 para React 19: os 45 tickets do Linear com o label `migration-react` (códigos [M0.1] a [M10.5]), um por vez, na ordem das dependências, até o cutover.

PASSO 0 — RETOMAR OU COMEÇAR
1. Leia, nesta ordem: `AGENTS.md`, `docs/react-migration-2026-11.md` (o plano: Seção 1 e a tabela "Relações" da Seção 2), e `docs/react-standards.md` se já existir (é criado no M0.2; até lá, use o Anexo A do plano).
2. No Linear, liste as issues com o label `migration-react` e monte a fila: ordene topologicamente pelas relações "blocked by" (a tabela do plano é a fonte; a issue é a verdade se divergirem) e, em empate, pelo código M (M0.1, M0.2, …, M10.5). Ignore as que estão Done ou Canceled.
3. Abra `docs/qa/migration-progress.md` se existir. Ele é o seu diário: um bloco por ticket com data, branch, PR, o que ficou de fora e as decisões tomadas. Se não existir, crie-o no primeiro ticket. Retome do primeiro ticket que não está Done; se ele está In Progress com branch aberta, continue na branch em vez de recriá-la.
4. Rode `pnpm install` e `pnpm --filter contracts build` (os apps consomem o `dist`; contrato velho = formulário que não submete em silêncio).

PARA CADA TICKET DA FILA, NESTA ORDEM
5. Confirme que todos os bloqueadores estão Done. Se algum não está, pule para o próximo ticket da fila cujos bloqueadores estão Done e anote o pulo no diário.
6. Se o ticket tem o label `ready-for-human` (M0.1, M0.10, M10.3, M10.5): faça tudo que é código e configuração de repositório, deixe na issue um checklist dos passos que exigem painel, credencial ou decisão (Cloudflare, Fly, TRUSTED_ORIGINS, aprovação do preview), mova para Blocked com o comentário "aguardando humano: …" e SIGA PARA O PRÓXIMO ticket da fila que não dependa dele. Não espere. (Exceção: o M0.1 é feito por você com o Prompt C do plano, se tiver Docker e o repositório locais; se não tiver, trate-o como humano.)
7. Leia o ticket inteiro: título, descrição, critérios de aceite, comentários. Leia por inteiro o arquivo Vue de origem citado e trace o fluxo na API (`apps/api/src/modules/...`) e nos contratos (`libs/contracts/src/...`). O comportamento, os textos de tela e as mensagens de toast do Vue são a especificação; o padrão React decide como implementar. Abra o baseline em `docs/qa/baseline-vue-2026-11/` para as rotas do ticket.
8. Leia o parágrafo específico do ticket em "Prompts específicos por ticket" (abaixo, no plano). Ele aponta o erro mais comum daquele ticket.
9. Crie a branch `feat/COM-xxx-<slug-curto>` a partir de `staging` (com o `staging` atualizado, já contendo os PRs anteriores mergeados — ver passo 14) e mova a issue para In Progress.
10. Implemente SÓ o escopo do ticket. Se descobrir algo fora do escopo, registre num comentário da issue e no diário; não implemente.
11. Deixe verde: `pnpm --filter web-react typecheck`, `lint`, `test`, `check:no-diamond`, `check:wcag` e `pnpm -r build` na raiz. Nenhum teste existente pode ser apagado ou marcado como skip para passar.
12. Para tickets de tela: suba `pnpm dev:react`, abra cada rota do ticket nos dois viewports (1440×900 e 390×844) e compare com o baseline. Salve os screenshots novos em `docs/qa/baseline-react-2026-11/` com os mesmos nomes. Liste no PR cada diferença e por quê ela é aceitável.
13. Passe por cada critério de aceite e marque-o na issue com a evidência (teste, screenshot ou comando). Auto-revisão contra a lista de regras abaixo (procure `useEffect`, `useState` com dado de API, `queryKey` literal, `memo(`, `@radix-ui` fora de `shared/components/ui`, `dangerouslySetInnerHTML`, `any`).
14. Commit no padrão do repositório (`feat(web-react): … (COM-xxx)`, em PT-BR), PR para `staging` com: resumo, lista de arquivos Vue → React, screenshots antes/depois, como testar. Mova a issue para In Review e cole o link do PR.
    - Se você tem permissão para fazer merge em `staging` depois do CI verde (o Luca decide isso ao te dar o prompt), faça o merge, atualize o `staging` local e mova a issue para Done.
    - Se não tem, NÃO espere a revisão: crie a branch do próximo ticket a partir da branch deste (encadeando PRs) e registre a cadeia no diário. Quando um PR da cadeia for mergeado, rebase os seguintes.
15. Escreva o bloco do ticket no diário `docs/qa/migration-progress.md` (data, branch, PR, decisões, o que ficou de fora, tempo gasto) e commite o diário junto com o PR.
16. Volte ao passo 5 com o próximo ticket da fila.

QUANDO PARAR
- Quando todos os tickets estiverem Done ou Blocked aguardando humano. Nesse caso, poste um comentário no épico raiz com: tickets Done, tickets Blocked e o que cada um espera, bundle inicial do React vs. do Vue, número de testes, e os itens fora de escopo anotados ao longo do caminho.
- Quando um ticket ficar bloqueado por decisão de produto, credencial ou rota de API que não existe: mova para Blocked com o comentário dizendo exatamente o que falta, registre no diário e siga para o próximo que não depende dele. Só pare de verdade se a fila inteira estiver bloqueada.
- Nunca pare no meio de um ticket sem commitar o estado atual numa branch e anotar no diário onde parou.

REGRAS NÃO NEGOCIÁVEIS (além do AGENTS.md)
- Estado de servidor só em TanStack Query, com key factory da feature; nunca `useEffect` + `useState` para buscar dado; nunca copiar resposta de API para Zustand/Context.
- Loading/erro/vazio explícitos (`isPending`, `isError`, `data.length === 0`); nunca inferir loading de `!data`.
- Após mutation, invalidar a key mais estreita listada no ticket; `setQueryData` só se o servidor devolver o recurso completo; optimistic update só se o ticket pedir.
- Estado local primeiro; URL para filtro/página/aba; Zustand só nos stores que o plano nomeia (`pwa`, `invited-companies`); Context só para a sessão.
- Sem `useEffect` para derivar estado. `useEffect` só para sincronizar com sistema externo (eventos de `window`, `beforeunload`), e o ticket diz quando.
- Formulários com React Hook Form + `zodResolver` usando os schemas de `@competa/contracts`; erros 422 do servidor via `applyFieldErrors`.
- Sem `memo`/`useMemo`/`useCallback` a não ser com medição registrada; o React Compiler está ligado.
- Primitivos de UI vêm do shadcn/ui gerados em `shared/components/ui/`; `@radix-ui/*` nunca é importado fora dessa pasta.
- Imports: `shared → features → app`; features não importam features (exceto `catalog`); componentes não chamam `useQuery`/`api` direto. O lint impõe; não desligue regras.
- Acessibilidade: todo controle com nome acessível, campos com `label`, foco visível, status com ícone + texto, um `h1` por página.
- Código sem comentários (regra 5 do AGENTS.md). Identificadores em inglês pelo glossário; texto de tela em PT-BR idêntico ao Vue.
- Não toque em `apps/web` (Vue), `apps/api` ou `libs/contracts` a menos que o ticket mande. O Vue só é removido no M10.5.
- Um ticket por vez. Não adiante trabalho de tickets futuros "já que está ali": isso quebra a rastreabilidade das issues e dos PRs.
```

### Prompts específicos por ticket (o passo 8 do Prompt B lê isto)

Uma linha por ticket com o que o agente mais erra nele. Não precisa colar: o agente lê daqui ao chegar no ticket. Se preferir rodar um ticket isolado, cole o Prompt B trocando a missão por "execute só o ticket COM-xxx" e acrescente a linha dele.

- **M0.1** — Siga o Prompt C (abaixo) dentro do fluxo do Prompt B; se não houver Docker/repositório local, trate como `ready-for-human`.
- **M0.2** — "Copie `vite.config.ts`, `index.html` e `public/` do `apps/web` antes de mudar qualquer coisa; a única mudança no Vite é o plugin. Crie `docs/react-standards.md` com o Anexo A do plano (texto integral). Não instale nada além da lista do ticket."
- **M0.3** — "Prove cada regra de boundaries com um arquivo temporário que viola e o lint falhando; apague o arquivo depois. Não use `eslint-plugin-import` para isso."
- **M0.4** — "Porte `scripts/check-api-error.ts` caso a caso para `api-error.spec.ts`; o `check-upload.ts` fica como TODO para o M8.2. Os scripts `no-diamond`/`wcag` são copiados, não reescritos."
- **M0.5** — "Funções, não classe. Mantenha o comportamento de 401 em `/auth/me` e `/my/profile` (devolve `null`). Adicione `signal?: AbortSignal` em toda função."
- **M0.6** — "Os defaults do QueryClient são centrais e só aqui; nenhuma feature redefine `retry` ou `staleTime` sem motivo escrito no ticket."
- **M0.7** — "Gere com `npx shadcn@latest add …` só os 16 em uso e depois ajuste classe por classe contra o `.vue` correspondente (o Vue é shadcn-vue customizado; o gerado é o padrão). Não porte os 20 primitivos sem uso. `native-select` e `empty` são portados à mão. Nada de `@radix-ui/*` fora de `shared/components/ui/`."
- **M0.8** — "`Modal` é casca sobre `Dialog`; `ErrorState` usa `failureKind`. `format.ts` e `item-status.ts` são cópias puras com spec."
- **M0.9** — "Declare as 33 rotas agora com `Placeholder`; `handle.title` e `handle.area` em todas; `errorElement` por segmento. Termos/Privacidade são cópia de texto."
- **M0.10** — "Copie o job `deploy-web-staging` e mude só o pacote, o projeto do Pages e o nome. O passo humano (criar o projeto no Pages e `TRUSTED_ORIGINS`) é do Luca; deixe o checklist na issue."
- **M1.1** — "A sessão é query + Context derivado; se você escreveu `useState` para guardar `accountant`, está errado. Suspense só nos guards. `signOut` limpa o cache inteiro."
- **M1.2–M1.5** — "RHF + schema do contrato; `applyFieldErrors` nos 422; sem `useEffect`. Textos idênticos ao Vue."
- **M2.1** — "`menuOpen`/`profileOpen` são `useState`. O indicador de mutação é `useIsMutating()`. Compare o menu aberto no mobile com o baseline."
- **M2.2** — "Um arquivo por chamada em `api/`, key factory única, teste de invalidação por mutation com spy. Nada de UI aqui."
- **M2.3** — "A prévia do fan-out é uma query com `enabled` derivado (modal aberto + mês válido); o resumo pós-abertura é `useState` local do diálogo. `?page=` na URL."
- **M2.4** — "`?contador=` na URL. `CloseRequestDialog` nasce aqui e é reusado no M3.1. Copie os 17 textos de toast."
- **M3.1** — "Rascunho da revisão em `useReducer`; `DocumentPreview` dentro de `react-error-boundary`; revogue o object URL ao fechar."
- **M4.1** — "Store Zustand `invited-companies` com `persist` em `sessionStorage` e `partialize`; confira a chave real do Vue antes de nomear."
- **M4.2** — "Filtros na URL; debounce só no input; `selectedIds` local e limpo por `key` ao mudar filtro. Templates vêm de `features/catalog`."
- **M4.3** — "`useFieldArray` para Responsáveis; `defaultValues` após a query resolver com `key`, sem `reset` em efeito. Máscaras em `Controller`."
- **M4.4** — "`catalog` é feature-folha; mova `getTemplates`/`getDocumentTypes` para lá e ajuste o lint. O picker reseta a página por derivação, não por efeito."
- **M4.5** — "`readSpreadsheet` é função pura testável; `import('xlsx')` lazy; dropzone em `react-error-boundary`; máquina de estados em `useReducer`."
- **M5.1** — "Invalidar `catalogKeys.templates()` (fica em `catalog`); `templateKeys` só para detalhe."
- **M5.2** — "`useBlocker` + `beforeunload` (único `useEffect`). Reproduza COM-265/270/271 como testes."
- **M6.1** — "A query inteira vem da URL parseada com `MessageListQuery`; mudar filtro escreve `page=1` na mesma chamada de `setSearchParams`."
- **M7.1** — "Invalidar `firmKeys.detail()` **e** `authKeys.me()`. `defaultValues` com `key`, sem efeito."
- **M7.2** — "Mensagens de 422/403 vêm do servidor via `apiErrorMessage`; não invente texto."
- **M7.3** — "Status é `useQuery`; zero chamadas a `api.*` fora de `api/`."
- **M7.4** — "`?plano=` e `?ciclo=` na URL; valide o host das URLs do Asaas; invalide `authKeys.me()` ao cancelar."
- **M8.1** — "Listeners de `window` registrados no módulo do store, não em componente. `vapidKey` com `staleTime: 'static'`."
- **M8.2** — "Porte todos os casos de `check-upload.ts` antes de declarar o hook pronto; `useReducer`, deps injetadas."
- **M8.3** — "Teste explícito de que o handler MSW e a tela não têm `storageKey`/download. Mobile primeiro."
- **M9.1–M9.5** — "Mova `use-upload`, `dropzone`, `upload-feedback` e `document-preview` para `shared/` quando o segundo consumidor aparecer (M9.3 e M9.4), nunca importando de outra feature. Na confirmação do link perdido, a API só é chamada no clique."
- **M10.1** — "Router real com `createMemoryRouter` + MSW; afirme o que o usuário vê e o que a API recebeu; cada spec prova uma invalidação."
- **M10.2** — "Rode o Prompt C contra o React; relatório linha a linha; axe sem `serious`/`critical`."
- **M10.3 / M10.5** — "São `ready-for-human`: prepare tudo, liste os passos de painel para o Luca e pare antes deles."
- **M10.4** — "Meça antes de otimizar; números no PR e em `docs/frontend-status.md`."

## Prompt C — Baseline visual (screenshots de todas as telas do app Vue)

> **Cole no agente que roda no Mac do Luca com o repositório e o Docker disponíveis** (o `apps/api/docker-compose.yml` sobe o Postgres). Usar antes de qualquer ticket de tela, e de novo no M10.2 trocando `web` por `web-react`, a porta 5173 por 5174 e a pasta de saída por `baseline-react-2026-11`.

```text
Capture um baseline visual de todas as telas do app `apps/web` (Vue) do repositório Competa, sem alterar nenhum arquivo do app.

AMBIENTE
1. Na raiz: `pnpm install`, `pnpm --filter contracts build`.
2. Postgres local: `docker compose -f apps/api/docker-compose.yml up -d db`. API com `NODE_ENV=development` (storage em disco, e-mail e push no console — nenhum provedor externo). Se `apps/api/.env` aponta para o Supabase de staging, crie um `.env.local` apontando para o Postgres do compose; não grave documento nem envie e-mail por engano para staging.
3. `pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api create-firm` (anote o token do convite inicial impresso).
4. `pnpm dev` na raiz (API em :3000, web em :5173). Em outro terminal, siga.

DADOS DE CENA (via UI ou API, o mínimo para cada tela ter conteúdo)
5. Aceite o convite inicial em `/convite/<token>` criando o Contador dono. Entre.
6. Crie 3 Empresas (uma sem Responsável, uma com Responsável por e-mail, uma com dois Responsáveis), aplique um template do produto a duas delas, crie um override em uma.
7. Derive um template do produto e edite um item.
8. Abra a competência do mês atual com prazo em 5 dias (anote os links de envio impressos no console da API — e-mail em dev vai para o console).
9. Pelo link de uma Empresa, envie 2 arquivos (um PDF e uma imagem) e um documento extra.
10. No painel, revise: aceite um item e rejeite outro com motivo. Reenvie o link dessa Empresa.
11. Convide um segundo Contador (anote a URL do convite) e deixe o convite pendente.
12. Pelo link de envio, "Ativar acesso" para ter um Responsável com conta; depois saia.

CAPTURA (Playwright, Chromium; `deviceScaleFactor: 2`; aguardar `networkidle` e 500 ms)
13. Escreva um script `docs/qa/baseline-vue-2026-11/capture.ts` (fica no repositório) que, para cada rota de `apps/web/src/router/index.ts`, nos viewports desktop 1440×900 e mobile 390×844, tira `page.screenshot({ fullPage: true })` com o nome `<rota-slug>__<desktop|mobile>__<estado>.png`. Estados obrigatórios:
   - Públicas: `/entrar`, `/cadastro` (passo 1 e passo 2), `/esqueci-senha` (inicial, enviado), `/redefinir-senha?token=x` (inválido), `/convite/<token-do-segundo-contador>`, `/termos`, `/privacidade`, `/nao-existe` (404), `/perdi-meu-link` (inicial, enviado), `/perdi-meu-link/confirmar?token=x`.
   - Envio: `/envio/<token>` (com pendências; com rejeição; durante envio se conseguir; sucesso com as ofertas), `/envio/<token-invalido>` (expirado/inválido).
   - Painel (logado como dono): `/competencias` (com dados; modal de abertura aberto com prévia; e **antes** de abrir qualquer competência, uma captura vazia — faça essa primeiro, logo após o passo 5), `/competencias/:id/pendencias` (com falha de canal visível se houver, com filtro de contador aplicado), `/solicitacoes/:id` (com pendentes; com rejeição; com extras), `/empresas` (com dados; aba Inativas; com seleção; e vazia, logo após o passo 5), `/empresas/nova`, `/empresas/:id/editar` (a com dois Responsáveis), `/empresas/:id/checklist` (com override; picker aberto), `/empresas/importar` (inicial; prévia com erro; relatório), `/templates`, `/templates/:id` (do produto; derivado com item em edição; diálogo de sair sem salvar), `/mensagens` (sem filtro; com filtro e página 2 se houver; linha com erro aberto), `/configuracoes/contabilidade`, `/configuracoes/contadores` (com convite pendente; formulário de convite aberto), `/configuracoes/whatsapp`, `/configuracoes/plano` (trial ativo; e com `?plano=essencial`).
   - Painel como membro (aceite o convite do segundo Contador em outra sessão/contexto): `/configuracoes/contabilidade`, `/configuracoes/plano`, `/configuracoes/whatsapp` em somente leitura.
   - Área do Responsável (logado com a conta ativada): `/minha-area/acesso` (deslogado: inicial e "link enviado"), `/minha-area/definir-senha`, `/minha-area/pendencias` (com pendências; vazio se conseguir), `/minha-area/competencias` (lista; período expandido; preview aberto).
   - Layout: `/competencias` mobile com o menu lateral aberto; `/__` não existe no Vue — pule.
14. Para estados que dependem de interação (modal aberto, menu aberto, item em edição), o script faz os cliques; para os que dependem de dados (rejeição, falha de canal), use o que o passo 5–12 criou.
15. Gere `docs/qa/baseline-vue-2026-11/index.md`: tabela `arquivo | rota | viewport | estado | o que observar` (uma linha por imagem; "o que observar" = os elementos que o ticket React precisa reproduzir: contagens, pílulas de status, botões, mensagens).
16. Abra cada imagem e confirme que não está em branco nem cortada; refaça as que falharam.

ENTREGA
17. Commit `chore(qa): baseline visual do apps/web antes da migração para React` com a pasta inteira (imagens, `capture.ts`, `index.md`). Anexe o `index.md` e um zip das imagens à issue do épico raiz da migração no Linear e feche o ticket M0.1 com o link do commit.
18. Não altere nenhum arquivo em `apps/web/src`. Se precisar de um dado que a UI não cria, use a API ou o seed, e registre o que fez no `index.md`.
```

---

# Anexo A — Padrão React do `apps/web-react` (vai para `docs/react-standards.md`)

> Texto literal do padrão exigido para a reconstrução, mantido em inglês por ser citação. O ticket M0.2 cria o arquivo com um cabeçalho em PT-BR: "Padrão normativo do `apps/web-react`. Em caso de conflito com `docs/conventions.md`, este documento vence para o frontend; o `AGENTS.md` continua valendo para nomenclatura, comentários, invariantes de segurança e styling."

```text
Act as a senior React engineer. Build this app using modern, production-grade React standards.

CORE PRINCIPLES
- Separate server state, client state, and UI-local state.
- Use TanStack Query for ALL server/API data: fetching, caching, loading/error states, retries, background refetching, and invalidation.
- Use local React state first. Lift state only when multiple components need it.
- Use Zustand for global client/UI state. Do not use Zustand for server data.
- Use React Context only for low-frequency, app-wide values such as theme, auth/session provider, or configuration.
- Use URL/search params for filters, pagination, tabs, and other shareable UI state.
- Organize code by feature, not only by file type.
- Keep shared code domain-agnostic. Shared code must not import from feature code.
- Do not add abstractions until there are at least two real consumers.
- Do not use useEffect to derive state from props/state. Derive values during render instead.
- Use useEffect only for synchronization with external systems.
- Keep components pure and avoid redundant state.

TECH STACK / DEFAULTS
- React + TypeScript.
- TanStack Query for server state.
- Zustand for global client state.
- React Hook Form + Zod for forms, unless the project already uses another standard.
- React Router or the project's existing routing solution.
- React Compiler where available.
- ESLint + Prettier/Biome.
- Strict TypeScript.
- Route-level code splitting for large features.
- Error Boundaries around route segments and risky widgets.

TANSTACK QUERY STANDARDS
- Use TanStack Query for every remote data request.
- Never fetch server data in useEffect and store it in useState, Zustand, Redux, or Context.
- Keep query keys, query functions, types, and custom hooks colocated in the feature that owns the resource.
- Use query-key factories. Never scatter raw string arrays across components.
- Query keys must include every variable that affects the response: IDs, filters, search, pagination, sorting, etc.
- Query functions must be pure: accept arguments, call the API, and return typed data. No UI logic inside them.
- Use useQuery for reads and useMutation for writes.
- Explicitly handle isPending, isError, data, and empty results in the UI.
- Do not infer loading from !data because cached data may exist during a background refetch.
- Use Suspense/useSuspenseQuery only for route-critical data, with proper Suspense boundaries and prefetching where appropriate.
- Set sensible QueryClient defaults centrally: staleTime, gcTime, retry behavior, and refetchOnWindowFocus.
- Use staleTime: Infinity only when data should refresh only after explicit invalidation.
- Use 'static' only for data that cannot change during the app lifetime, such as boot-time feature flags or permissions.
- After a successful mutation, invalidate the narrowest relevant query keys.
- Prefer invalidation after mutation as the default cache-update strategy.
- Use setQueryData only when the server returns the complete updated resource and the cache can be updated immutably.
- Use optimistic updates sparingly, only for high-value interactions. Always implement rollback and reconciliation logic.

EXAMPLE STRUCTURE FOR A FEATURE
src/features/todos/
  api/
    get-todos.ts
    create-todo.ts
    todo.types.ts
  queries/
    todo-keys.ts
    use-todos.ts
    use-create-todo.ts
  components/
    todo-list.tsx
    todo-item.tsx
  index.ts

QUERY KEY EXAMPLE
export const todoKeys = {
  all: ['todos'] as const,
  lists: () => [...todoKeys.all, 'list'] as const,
  list: (filters: TodoFilters) => [...todoKeys.lists(), filters] as const,
  details: () => [...todoKeys.all, 'detail'] as const,
  detail: (id: string) => [...todoKeys.details(), id] as const,
};

QUERY HOOK EXAMPLE
export function useTodos(filters: TodoFilters) {
  return useQuery({
    queryKey: todoKeys.list(filters),
    queryFn: () => getTodos(filters),
  });
}

MUTATION EXAMPLE
export function useCreateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoKeys.lists() });
    },
  });
}

LOADING / ERROR / EMPTY STATE EXAMPLE
const todos = useTodos(filters);

if (todos.isPending) return <TodoListSkeleton />;
if (todos.isError) return <ErrorState retry={todos.refetch} />;
if (!todos.data.length) return <EmptyState />;

return <TodoList todos={todos.data} />;

STATE MANAGEMENT DECISION TREE
1. Is the state component-local? Use useState.
2. Is it derived from props or existing state? Calculate it during render; do not store it.
3. Do multiple components under one parent need it? Lift it to the closest common parent.
4. Is it server data? Use TanStack Query.
5. Is it URL-representable? Use route/search params.
6. Is it global client/UI state? Use Zustand.
7. Is it mostly read-only global configuration? Use React Context.
8. Is it complex local workflow state? Use useReducer.

ZUSTAND STANDARDS
- Create feature-scoped Zustand stores, not one giant global store.
- Store only client/UI state: modals, drawers, toasts, selected items, wizard steps, local feature flags, etc.
- Do not store API responses, server cache, or query status in Zustand.
- Select narrow slices from stores.
- Use useShallow when selecting multiple fields or objects/arrays.
- Update state immutably.
- Split large stores into smaller slices.
- Use persist only for state that genuinely needs to survive reloads.
- Use partialize with persist to avoid storing transient or sensitive data.

ZUSTAND EXAMPLE
type CheckoutStore = {
  step: 'cart' | 'shipping' | 'payment';
  setStep: (step: CheckoutStore['step']) => void;
};

export const useCheckoutStore = create<CheckoutStore>()((set) => ({
  step: 'cart',
  setStep: (step) => set({ step }),
}));

FOLDER STRUCTURE
src/
  app/
    providers/
    router/
    routes/
    app.tsx

  features/
    auth/
      api/
      components/
      hooks/
      queries/
      store/
      types/
      utils/
      index.ts

    billing/
      api/
      components/
      hooks/
      queries/
      types/
      index.ts

  shared/
    components/
      ui/
      layout/
    hooks/
    lib/
      api-client.ts
      query-client.ts
      utils.ts
    types/
    config/

  testing/
    mocks/
    factories/
    test-utils.tsx

FOLDER / ARCHITECTURE RULES
- shared/ may not import from features/.
- features/ may import from shared/, but not from another feature.
- app/ composes features into routes, layouts, and providers.
- Each feature exposes a public API through index.ts.
- Keep feature internals private.
- Delete a feature by deleting its folder and its route/provider wiring in app/.
- Start simple and grow the structure only as the application grows.

MEMOIZATION / PERFORMANCE
- Enable React Compiler where possible.
- Do not blanket-wrap components in memo.
- Do not blanket-wrap functions in useCallback.
- Do not blanket-wrap values in useMemo.
- Rely on React Compiler for automatic memoization in most cases.
- Use React.memo only for components that re-render often with stable props and have expensive rendering.
- Use useCallback only when referential stability is required, such as passing callbacks to memoized children or satisfying effect dependencies.
- Use useMemo only for expensive calculations or referential stability requirements.
- Measure performance before optimizing.
- Use React DevTools Profiler and production tracing when investigating performance.
- Do not optimize prematurely.

ENGINEERING GUARDRAILS
- Type the API boundary once and validate API responses with Zod or an equivalent schema library.
- Keep API clients thin: typed request functions only, no business logic in components.
- Do not trust raw JSON types.
- Test behavior, not implementation details.
- Prioritize tests for feature hooks, query invalidation, critical flows, and business logic.
- Avoid trivial tests for simple presentational components.
- Enforce architecture with lint rules where possible.
- Prevent cross-feature imports.
- Keep imports flowing in one direction: shared -> features -> app.

WHEN BUILDING FEATURES
- colocate related components, hooks, API calls, query keys, types, and store logic.
- expose a minimal public API from each feature.
- avoid creating global folders for every component, hook, or utility.
- avoid putting feature-specific logic in shared/.
- avoid storing server data in client state.
- avoid using Context as a general-purpose state manager.
- avoid using useEffect for data fetching or derived state.
- avoid premature memoization.
- avoid one giant global Zustand store.
- avoid duplicating server state between TanStack Query and Zustand.

Follow these standards consistently throughout the entire application.

COMPETA-SPECIFIC ADDENDA (decided in the migration plan, 2026-11)
- One exception to "features may not import from another feature": the leaf feature `catalog` (document types, template options, CatalogPicker). It imports nothing from other features and is the only feature others may import. Enforced by eslint-plugin-boundaries.
- The session (`/auth/me`, `/my/profile`) is a TanStack Query owned by `features/auth`; its derived value is exposed through a Context defined in `shared/session` and provided by `app/providers`. The Context holds no state of its own.
- Allowed Zustand stores: `shared/pwa/install.store.ts` and `features/companies/store/invited-companies.store.ts`. Adding a store requires a ticket that names the client-only state it holds.
- `useSuspenseQuery` is used only in the route guards (session). Pages use `useQuery` with explicit pending/error/empty rendering.
- Side-effect hooks allowed: `useBlocker` + `beforeunload` in the template editor; window listeners for PWA install registered once at module level. Anything else needs a ticket.
- Hooks that take injected dependencies (`useUpload`) and primitives used by two features move to `shared/` at the moment the second consumer appears, not before.
- UI primitives come from shadcn/ui, generated into `shared/components/ui/` and customized there. `@radix-ui/*` (what shadcn installs underneath) is never imported outside that folder; enforced by `no-restricted-imports`.
- AGENTS.md still governs naming (EN identifiers / PT-BR UI), no comments, upload-flow invariants (never file names, storage keys or download routes under the upload token), Tailwind-only styling, and contracts from `@competa/contracts` as the single validation source.
```

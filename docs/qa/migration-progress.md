# Diário da migração Vue → React (`apps/web` → `apps/web-react`)

Um bloco por ticket, na ordem em que foram executados. Plano: [`docs/react-migration-2026-11.md`](../react-migration-2026-11.md). Issues: label `migration-react` no Linear (épico raiz COM-295).

## Decisões de execução que valem para a fila inteira

- **Tudo aponta para `main`** (decisão do Luca, 2026-11-07): a cadeia nasce do `origin/main` e todo PR tem base `main`, não `staging` (o Prompt B dizia `staging`). Os PRs #20–#31 foram reapontados para `main`.
- **Sem permissão de merge.** O prompt não a concedeu, então os PRs são encadeados: cada branch nasce da anterior. A cadeia está registrada abaixo, ticket a ticket.
- **Linear não tem o estado "Blocked"** no time COM. Ticket parado por humano fica em **Todo** com o comentário "aguardando humano: …" e o checklist.
- **Worktree próprio** (`../competa-react`), para não mexer nos arquivos staged da branch `fix/qa-staging-findings` do checkout principal. O hook de pre-commit roda a suíte da API; o worktree usa o banco `competa_react_test` (`DB_NAME=competa_react_test git commit …`), porque o `competa_test` compartilhado não tem as migrations do `main`.
- **Bloqueador "satisfeito" = Done ou In Review com PR na cadeia.** Sem merge, nada chega a Done; exigir Done travaria a fila no M0.2. O passo 14 do Prompt B (encadear sem esperar revisão) só faz sentido com essa leitura.
- **Como a cadeia é linear, o PR do ticket N contém os commits dos tickets anteriores**; o corpo do PR diz qual é o commit do ticket. Merge em ordem, do #20 para frente.

## Cadeia de PRs

| Ticket       | Branch                             | Nasce de      | PR (base `staging`)                                   |
| ------------ | ---------------------------------- | ------------- | ----------------------------------------------------- |
| M0.1 COM-314 | `feat/COM-314-baseline-vue`        | `origin/main` | [#20](https://github.com/lucamendesq/competa/pull/20) |
| M0.2 COM-315 | `feat/COM-315-bootstrap-web-react` | M0.1          | (ver bloco)                                           |

---

## M0.1 · COM-314 · Baseline visual do app Vue

- **Data:** 2026-11-07
- **Branch:** `feat/COM-314-baseline-vue` (a partir de `origin/main` `1d982b7`) · **PR:** [#20](https://github.com/lucamendesq/competa/pull/20)
- **O que foi feito:** o agente rodou o Prompt C localmente (Docker com `api-db-1`, banco `competa_baseline`, API em `development` na porta 3100, Vue em 5173). `docs/qa/baseline-vue-2026-11/` tem 117 PNGs, o `capture.ts` (monta a cena pela API e captura com Playwright na mesma passada) e o `index.md` com a tabela imagem → rota → viewport → estado → o que observar.
- **Decisões:**
  - `playwright@1.48.2` entrou como devDependency da raiz: o M10.2 roda o mesmo script contra o React. O script aceita `CHROMIUM_PATH` para usar o Chrome do sistema.
  - A única linha gravada direto no banco é uma mensagem marcada como `failed`, porque em `development` nenhum canal falha. Está registrada no `index.md`.
  - O "relatório" da importação é o estado em que o Vue volta para `/empresas` depois de confirmar: é o que a tela faz hoje.
- **Ficou de fora:** `/minha-area/pendencias` vazio (o Responsável da cena tem pendências); `/mensagens` página 2 (só 6 mensagens). As imagens foram **linkadas** no épico (a pasta no PR), não anexadas como zip: são 33 MB e já moram no repositório.
- **Tempo:** ~1h30 (a maior parte ajustando as interações de 8 estados).

---

## M0.2 · COM-315 · Bootstrap do `apps/web-react`

- **Data:** 2026-11-07
- **Branch:** `feat/COM-315-bootstrap-web-react` (a partir de `feat/COM-314-baseline-vue`) · **PR:** [#21](https://github.com/lucamendesq/competa/pull/21)
- **O que foi feito:** pacote `web-react` (React 19.3, React Router 7.18, TanStack Query 5.106, Vite 7.3, `@vitejs/plugin-react` 5.2 com `babel-plugin-react-compiler` 1.0, Tailwind 4, `vite-plugin-pwa` 1.3). `vite.config.ts`, `index.html` e `public/` copiados do `apps/web`; no Vite a única mudança é o plugin. `src/shared/config/env.ts` valida `VITE_API_URL`/`VITE_AUTH_URL` com zod no boot. Raiz: `dev:react` (contracts em watch + API + web-react na 5174). `docs/react-standards.md` com o Anexo A integral, linkado no `AGENTS.md`.
- **Decisões:**
  - `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess` ficaram ligados: um arquivo temporário importando todo o `@competa/contracts` passou no `tsc -b`.
  - A porta 5174 vem do script `dev` (`vite --port 5174 --strictPort`), não do `vite.config.ts`, para manter a regra "a única mudança no Vite é o plugin".
  - O `index.html` monta em `#root` (era `#app`) e carrega `/src/main.tsx`; metas, ícones e manifest iguais.
  - `vite-plugin-pwa` subiu de 0.20 para 1.3 (a 0.20 não declara suporte ao Vite 7). A config é a mesma.
- **Evidência do React Compiler:** componente filho com `console.log` no render, pai com contador. No dev server: 2 renders na montagem (StrictMode) e 0 depois de 3 cliques no pai.
- **Ficou de fora:** `lint`, `test`, `check:no-diamond` e `check:wcag` entram no M0.3/M0.4, como o ticket diz.
- **Tempo:** ~40 min.

---

## M0.3 · COM-316 · Lint e regras de arquitetura

- **Data:** 2026-11-07
- **Branch:** `feat/COM-316-lint-boundaries` (a partir de `feat/COM-315-bootstrap-web-react`) · **PR:** [#22](https://github.com/lucamendesq/competa/pull/22)
- **O que foi feito:** bloco `apps/web-react/**/*.{ts,tsx}` no `eslint.config.mjs` da raiz: `typescript-eslint` recommended, `react-hooks` `recommended-latest` (regras do compiler), `jsx-a11y` recommended, `eslint-config-prettier`, `eslint-plugin-boundaries` 7.4 e as restrições de import/global. `lint-staged` cobre `*.tsx`. Script `lint` no pacote.
- **Decisões:**
  - `boundaries/root-path` aponta para `apps/web-react`: o plugin descreve o arquivo com caminho relativo ao cwd, então padrões `apps/web-react/src/...` não casavam quando o lint roda de dentro do pacote. Com a raiz fixa, o resultado é igual rodando da raiz ou do pacote.
  - A regra de entry point (`features/*/index.ts`) está dentro de `boundaries/dependencies` com `fileInternalPath: 'index.ts'`; o `boundaries/entry-point` está deprecado na v7. Imports dentro da mesma feature não passam pelo `index.ts`.
  - Exceções do `no-restricted-imports` de `@tanstack/react-query`: `features/*/queries/**`, `shared/session/**`, `shared/pwa/**`, `app/providers/**`, `src/testing/**` e `*.spec.{ts,tsx}` (testes montam `QueryClientProvider`).
  - `fetch` global proibido fora de `shared/lib/api-client.ts` e `features/upload/api/**` (`no-restricted-globals`).
  - Resolver do alias `@/` com `eslint-import-resolver-typescript` (sem `eslint-plugin-import`, como o ticket pede).
- **Prova de cada regra** (arquivos temporários, apagados depois): periods → companies, shared → feature, `app/routes` → arquivo interno de feature e periods → arquivo interno de `catalog` falham com a mensagem da regra; periods → `catalog` pelo `index.ts`, `app/routes` → `features/companies` pelo `index.ts` e periods → arquivo interno de periods passam. `useQuery` em `features/x/components/` falha; em `features/x/queries/` passa. `<img>` sem `alt` falha (`jsx-a11y/alt-text`). `@radix-ui/react-slot` e `fetch` num componente falham. Bônus: `setState` dentro de `useEffect` para derivar estado falha em `react-hooks/set-state-in-effect`.
- **Ficou de fora:** nada.
- **Tempo:** ~35 min.

---

## M0.4 · COM-317 · Infra de testes

- **Data:** 2026-11-07
- **Branch:** `feat/COM-317-test-infra` (a partir de `feat/COM-316-lint-boundaries`) · **PR:** [#23](https://github.com/lucamendesq/competa/pull/23)
- **O que foi feito:** Vitest 5 (jsdom) + Testing Library + `jest-dom` + MSW. `src/testing/`: `setup.ts`, `mocks/server.ts`, `mocks/handlers/auth.ts` (`/auth/me` com sessão de Contador, `/my/profile` 401), `mocks/api.ts` (`apiUrl`, `envelope`), fábricas `company`, `period`, `panelRow`, `request`, `template` (+ `accountantSession` para o handler) e `test-utils.tsx` com `renderWithProviders` e `renderHookWithProviders`. `test-utils.spec.tsx` mostra o MSW respondendo `GET /auth/me` (e um override 401 por teste). `check:no-diamond` (agora com `.tsx`, sem `.vue`) e `check:wcag` copiados. Seção "Testes" no `docs/react-standards.md`.
- **Decisões:**
  - **MSW 3** (o ticket diz v2; a 3 é a atual). A opção de request sem handler virou `onUnhandledFrame: 'error'`; conferido com um spec temporário que um `fetch` sem handler falha.
  - **jsdom 27**: o 31 derruba o worker do Vitest (`parser.tokenizer.flushCharacters is not a function`).
  - **`SessionProvider` ainda não entra no `renderWithProviders`**: ele nasce no M1.1. O teste de exemplo resolve a sessão com uma query local. O M1.1 acrescenta a opção `session` (anotado lá).
  - Specs e `src/testing/` podem usar `fetch` (exceção no lint), para afirmar o comportamento do MSW sem depender do api-client do M0.5.
  - `vitest.config.ts` separado do `vite.config.ts` (sem PWA nos testes), com `VITE_API_URL=http://api.test` no `test.env`.
- **Ficou de fora:** `api-error.spec.ts` entra no M0.5 junto com o `api-error.ts` (o ticket permite o teste de fumaça antes). **TODO para o M8.2:** portar `apps/web/scripts/check-upload.ts` para `features/upload/hooks/use-upload.spec.ts`.
- **Tempo:** ~40 min.

---

## M0.5 · COM-318 · api-client, api-error e auth-client

- **Data:** 2026-11-07
- **Branch:** `feat/COM-318-api-client` (a partir de `feat/COM-317-test-infra`) · **PR:** [#24](https://github.com/lucamendesq/competa/pull/24)
- **O que foi feito:** `shared/lib/api-client.ts` em funções (`api.get/page/post/patch/put/delete/blobUrl/download`), com o mesmo comportamento do Vue e `signal` opcional em todas; `parsed(schema)` para validar a resposta com o contrato. `shared/lib/api-error.ts` copiado, mais `applyFieldErrors(error, setError)` para o React Hook Form. `shared/lib/auth-client.ts` com `better-auth/react` + `magicLinkClient`. `busy.ts` não foi portado (o indicador vem do `useIsMutating()` no M2.1).
- **Decisões:**
  - Assinatura nova `api.get(url, { params, signal })` em vez de `api.get(url, params)`: o `signal` do `queryFn` entra em todas as chamadas sem um terceiro argumento posicional.
  - O único estado de módulo é o handler de sessão expirada.
  - Lint: specs (`*.spec.{ts,tsx}`) viraram a categoria `test` do boundaries e podem importar `src/testing` de qualquer camada; código de produção continua proibido (conferido com um arquivo temporário em `features/`).
- **Testes:** `api-error.spec.ts` (todos os casos do `check-api-error.ts`, mais `applyFieldErrors`, `apiErrorCode`, `isNotFound` e `failureKind`) e `api-client.spec.ts` (401 em `/auth/me` e `/my/profile` → `null` sem expirar a sessão; 401 em `/periods` → expira e lança; envelope e limpeza de parâmetros; paginação; corpo de erro na `ApiError`; `EMPTY_DOWNLOAD`; `AbortSignal`; `parsed`). 24 testes no pacote.
- **Ficou de fora:** nada.
- **Tempo:** ~30 min.

---

## M0.6 · COM-321 · QueryClient, providers e sessão expirada

- **Data:** 2026-11-07
- **Branch:** `feat/COM-321-query-client-providers` (a partir de `feat/COM-318-api-client`) · **PR:** [#25](https://github.com/lucamendesq/competa/pull/25)
- **O que foi feito:** `shared/lib/query-client.ts` (`makeQueryClient` com os defaults centrais do ticket; 4xx não repete). `app/providers/app-providers.tsx`: `ErrorBoundary` raiz ("Algo deu errado" + "Recarregar"), `QueryClientProvider` e `Toaster` do sonner (`richColors`, `top-right`). `app/providers/session-expiry.ts`: registra o `onSessionExpired` uma vez; em rota com `handle.area` mostra o toast (id `session-expired`), remove `authKeys.all` do cache e navega para `/entrar` ou `/minha-area/acesso`; em rota pública não faz nada (igual ao Vue). `main.tsx` monta `StrictMode > AppProviders > RouterProvider` e importa `@competa/contracts` pela voz PT-BR do zod, como o `main.ts` do Vue.
- **Decisões:**
  - O registro do handler acontece no `main.tsx`, no nível do módulo, e não num `useEffect` do provider: o QueryClient e o router já são singletons ali, e assim não há efeito nem registro duplo no StrictMode.
  - `authKeys` (só a key factory) nasce em `features/auth/queries/auth-keys.ts`, porque o ticket manda limpar `authKeys.all`. As queries de sessão continuam no M1.1.
  - `app/router/router.tsx` tem uma rota só (`*`) para o `RouterProvider` montar; o M0.9 declara as 33 rotas. `app/router/route-handle.ts` tipa `handle.title`/`handle.area` e lê a área do último match que a declara.
  - O `SessionProvider` entra no M1.1 (o ticket diz "M1.1 preenche"). O `Toaster` usa o `sonner` direto; o M0.7 gera o wrapper do shadcn.
  - Exceção de lint para `shared/lib/query-client.ts` importar `@tanstack/react-query` (o plano põe o arquivo ali).
- **Testes:** `query-client.spec.ts` (404 → 1 chamada; 500 → 4 chamadas, isto é, 3 retries; mutations sem retry) e `app-providers.spec.tsx` (Contador → `/entrar` com um toast só mesmo com dois 401 e cache de sessão limpo; Responsável → `/minha-area/acesso`; rota pública não reage; erro num filho mostra o ErrorBoundary). 31 testes no pacote. O app sobe no navegador sem erro no console.
- **Ficou de fora:** nada além do que é de M0.9/M1.1.
- **Tempo:** ~35 min.

---

## M0.7 · COM-319 · Tokens e primitivos de UI

- **Data:** 2026-11-07
- **Branch:** `feat/COM-319-design-tokens-ui` (a partir de `feat/COM-321-query-client-providers`) · **PR:** [#26](https://github.com/lucamendesq/competa/pull/26)
- **O que foi feito:** `src/main.css` copiado byte a byte do Vue (o `diff` não acusa nada); fontes Outfit e Plus Jakarta Sans no `main.tsx`. `components.json` do shadcn (new-york, Tailwind v4) e `shared/lib/cn.ts`. Primitivos em `shared/components/ui/<nome>/` com `index.ts`: button, input, label, textarea, native-select, table, pagination, card, dialog, sheet, tooltip, separator, skeleton, empty, sonner. Galeria interna em `/__ui`, só em DEV (rota lazy; não entra no bundle de produção).
- **Como foi feito:** `npx shadcn@latest add …` gerou a estrutura React; depois cada string de classe foi trocada pela do `.vue` correspondente (o Vue é shadcn-vue customizado), tirando as variantes `dark:` (sem dark mode desde outubro/2026). `native-select` e `empty` portados à mão do Vue. Ícones `@radix-icons/vue` → `lucide-react` equivalentes.
- **Decisões:**
  - **15 primitivos, não 16: `toggle` não foi portado.** O único consumidor dele no Vue é o `toggle-group`, que também não tem consumidor; Decisão 4 do plano ("só se porta o que é usado") vence a contagem do ticket.
  - O CLI do shadcn escreveu numa pasta literal `@/` (lê o alias do `tsconfig.json` raiz, que não tem `paths`) e instalou `cn` e `next-themes` por engano; os arquivos foram movidos e os dois pacotes removidos. O pacote headless agora é o `radix-ui` unificado: o lint passou a proibir `radix-ui` e `@radix-ui/*` fora de `shared/components/ui`.
  - **`Button` não trava sozinho durante escritas.** No Vue, todo botão ficava `disabled` enquanto o `busy.ts` contava uma escrita em voo. O `busy.ts` saiu no M0.5, e `shared/components/ui` não pode importar o TanStack. Cada tela passa `disabled={mutation.isPending}` no botão da própria ação; o indicador global (`useIsMutating`) fica no layout (M2.1).
  - **`DialogContent` devolve o foco a quem abriu.** O Radix só devolve o foco ao `Dialog.Trigger`; no app quase todo diálogo é controlado por um botão da página. O conteúdo guarda o elemento focado ao abrir e o refoca ao fechar (sem mudar nada quando há `Trigger` ou o consumidor trata `onCloseAutoFocus`).
  - **`Pagination` sem estado:** `page`, `pageCount`, `onPageChange` e `siblingCount`. O cálculo das páginas (`pageItems`) reproduz o do reka-ui com `sibling-count=1` e `show-edges`. `nav` com `aria-label`; botões "Anterior"/"Próxima" com nome acessível.
  - `EmptyState` aceita `icon`/`media`, `title`, `description` e `actionLabel` + `onAction` (as props e slots do Vue).
- **Testes:** `dialog.spec.tsx` (título e descrição acessíveis, foco preso com Tab, Esc fecha e devolve o foco ao gatilho, botão "Fechar") e `pagination.spec.ts` (`pageItems` no começo, meio, fim e com tudo visível). 39 testes no pacote.
- **Comparação visual:** `docs/qa/baseline-react-2026-11/ui__{desktop,mobile}__{galeria,dialogo,sheet}.png`. Conferido contra o baseline Vue: botão primário âmbar e secundário escuro como em `/competencias` e `/empresas`; `EmptyState` igual ao de `/empresas` vazio; diálogo com título centrado no mobile e "Fechar" no canto. O formato bottom-sheet do modal de abertura no mobile vem do `Modal.vue` (M0.8), não do primitivo.
- **Ficou de fora:** nada.
- **Tempo:** ~1h15.

---

## M0.8 · COM-322 · Componentes compartilhados de domínio neutro

- **Data:** 2026-11-07
- **Branch:** `feat/COM-322-shared-components` (a partir de `feat/COM-319-design-tokens-ui`) · **PR:** [#27](https://github.com/lucamendesq/competa/pull/27)
- **O que foi feito:** `shared/components/{callout,error-state,not-found-state,loading-rows,page-header,status-pill,modal,logo,due-date,spinner}.tsx`, com as classes e os textos do Vue. `shared/lib/format.ts` e `shared/lib/item-status.ts` copiados de `utils/`. Seções novas na galeria `/__ui`.
- **Decisões:**
  - `ErrorState` recebe `error`, `retry` e `fallback` (o Vue recebia `message` pronto): offline vira "Sem conexão com o servidor. Verifique sua internet."; com mensagem do servidor usa `apiErrorMessage`; sem nada, "Erro inesperado. Tente novamente." (o padrão do Vue). Os `title` que as páginas Vue passavam ao `ErrorState` não eram props dele e não aparecem na tela; o React não os aceita.
  - `Modal` ganhou `footer`: a barra `bg-muted/40` com borda que as telas Vue repetiam à mão dentro do slot. Sem `description`, o `Modal` põe a descrição só para leitor de tela (o Radix exige `Description`).
  - `Callout` aceita um ícone `lucide` no lugar do nome em string do Vue (que era ignorado) e `actions` como prop.
  - `item-status.ts`: `Rejection.fileName` virou `string | undefined` explícito por causa do `exactOptionalPropertyTypes`. Nenhuma outra mudança nas funções copiadas.
- **Testes:** `format.spec.ts` (`maskedCnpj`, `cnpjInputMask`, `phoneInputMask`, `maskedPhone`, `monthLabel`/`monthShort`, `brl`, `dateBr`, `fileSize`, `foldAccents`, `slug`) e `error-state.spec.tsx` (offline + retry, mensagem do servidor, padrão). 52 testes no pacote.
- **Visual:** `ui__{desktop,mobile}__{galeria,modal}.png` atualizados. O `Modal` no mobile ocupa a largura toda com a barra de rodapé, como os modais do baseline Vue.
- **Ficou de fora:** os componentes com domínio (TermsConsent, InstallButton, UploadFeedback, PlanCapBanner, PlanGateNotice, ResendNotice, CatalogPicker, CloseRequestModal) vão para as features nos tickets delas, como o ticket manda.
- **Tempo:** ~40 min.

---

## M0.9 · COM-320 · Router, Termos, Privacidade e 404

- **Data:** 2026-11-07
- **Branch:** `feat/COM-320-router` (a partir de `feat/COM-322-shared-components`) · **PR:** [#28](https://github.com/lucamendesq/competa/pull/28)
- **O que foi feito:** `app/router/routes.tsx` com todas as rotas do `router/index.ts` do Vue (30 páginas lazy, 4 redirects, catch-all), `handle.title`/`handle.area` em todas, `errorElement` por segmento, guards `RequireAccountant`/`RequireContact`/`GuestOnly` declarados como layout routes (deixam passar até o M1.1). `RootLayout` aplica o título com o `<title>` do React 19 (sem efeito). `RouteErrorState`: 404 do router → `NotFoundPage`; `ApiError`/erro de rede → `ErrorState`; resto → a tela genérica. `/termos` e `/privacidade` com o texto do Vue sobre `shared/components/layout/public-layout.tsx`; `NotFoundPage` igual à do Vue. As 27 rotas sem ticket ainda renderizam um `Placeholder` com o nome da rota, cada uma no seu arquivo (e chunk).
- **Decisões:**
  - O `errorElement` fica numa rota **sem path** dentro de cada layout (raiz, `/`, `/minha-area`, públicas): o erro de uma página aparece no lugar do `Outlet` e o layout em volta continua.
  - `handle.area` ganhou `'public'`; o handler de sessão expirada só reage a `accountant`/`contact`.
  - `useDocumentTitle` virou uma função pura (`documentTitle(matches)`) + hook; o `RootLayout` renderiza `<title>`, que o React 19 leva ao `<head>`.
  - O catch-all manteve o comentário de intenção do Vue (tela branca), como o ticket pede.
  - **404 por enquanto sempre oferece "Entrar"**: o Vue escolhe entre "Ir para o painel", "Ir para minhas pendências" e "Entrar" lendo a sessão, que nasce no M1.1 (anotado na issue COM-327). O baseline captura o estado de visitante, que já bate.
  - A `NotFoundPage` entra no bundle principal (o `RouteErrorState` a usa direto); as outras 29 páginas têm chunk próprio.
- **Testes:** `routes.spec.tsx`: título de `/termos` → "Termos de Uso - Competa" e de `/competencias` → "Competa"; `/privacidade`; 404 com o caminho digitado; os 4 redirects; 30 páginas lazy; `ApiError` 500 numa rota mostra o `ErrorState` e mantém o layout. 61 testes no pacote.
- **Visual:** `termos`, `privacidade` e `404` (desktop e mobile) em `docs/qa/baseline-react-2026-11/`, iguais aos do Vue.
- **Ficou de fora:** guards de verdade e o botão do 404 por sessão (M1.1).
- **Tempo:** ~45 min.

---

## M0.10 · COM-323 · CI e preview do web-react (`ready-for-human`)

- **Data:** 2026-11-07
- **Branch:** `feat/COM-323-ci-web-react` (a partir de `feat/COM-320-router`) · **PR:** [#29](https://github.com/lucamendesq/competa/pull/29)
- **O que foi feito (repositório):** `ci.yml` roda `pnpm --filter web-react typecheck` e `test` no job `test` (o `build-lint` já cobria lint, format e `pnpm -r build`). Job novo `deploy-web-react-staging`, cópia do `deploy-web-staging` mudando só o pacote, o `dist` e o projeto do Pages (`competa-web-react-staging`). `docs/deploy.md` › Staging ganhou a seção "Preview do React (temporário, até o cutover)".
- **Decisões:**
  - O gatilho é o mesmo do `deploy-web-staging` atual: push na `main` ou "Run workflow". O ticket fala em "push na branch `staging`", mas o `ci.yml` do `main` não deploya staging a partir da branch `staging`; copiar o job sem mudar o gatilho é o que o prompt do ticket pede.
  - **O preview precisa de domínio custom** (`staging-react.competa.com.br`), ao contrário do que o ticket sugere: o `docs/deploy.md` já registra que em `*.pages.dev` o cookie de sessão da API vira cross-site e o navegador o barra.
  - O `approve-production` continua dependendo só de `deploy-api-staging` e `deploy-web-staging`: o preview não trava a produção.
- **Aguardando humano** (checklist na issue): criar o projeto Pages com o domínio, `TRUSTED_ORIGINS` no `competa-api-staging`, e conferir `/termos` + `GET /auth/me` sem erro de CORS no preview. A issue fica em **Todo** com o comentário "aguardando humano" (o time não tem estado Blocked).
- **CI:** os PRs #20–#27 da cadeia passaram em `build-lint` e `test`.
- **Tempo:** ~20 min.

---

## M1.1 · COM-327 · Sessão, SessionProvider, mutations de auth e guards

- **Data:** 2026-11-07
- **Branch:** `feat/COM-327-session-guards` (a partir de `feat/COM-323-ci-web-react`; o M0.10 não bloqueia nada, mas a cadeia é linear) · **PR:** [#30](https://github.com/lucamendesq/competa/pull/30)
- **O que foi feito:**
  - `shared/session/`: schemas zod `AccountantSession`/`ContactSession` (validam o `/auth/me` e o `/my/profile` com `parsed`), `deriveSession` (puro: `can`, `isOwner`, `isOverdue`, `status`) e `SessionContext` + `useSession()`. Nenhum estado próprio.
  - `features/auth/`: `api/auth.ts` (as chamadas do store Pinia), `authKeys` (`me`, `contactProfile`), `meOptions`/`contactProfileOptions` (`staleTime`/`gcTime: Infinity`, `retry: false`), as 12 mutations do ticket e os hooks de Suspense dos guards.
  - `app/providers/session-provider.tsx`: deriva o Context das duas queries; a do Responsável só roda quando o `/me` deu `null` (o `ensureLoaded` do Vue).
  - `app/router/guards.tsx`: `RequireAccountant`, `RequireContact` e `GuestOnly` com `useSuspenseQuery` dentro de `<Suspense>` (o único Suspense do app), guardando `from` no redirect para a entrada.
  - A `NotFoundPage` agora escolhe "Ir para o painel" / "Ir para minhas pendências" / "Entrar" pela sessão, como no Vue (pendência deixada no M0.9).
  - `renderWithProviders`/`renderHookWithProviders` ganharam a opção `session` (pendência do M0.4); `src/testing/mocks/sessions.ts` troca a sessão do MSW por teste.
- **Decisões:**
  - **As mutations esperam a sessão recarregar.** O `onSuccess` devolve a promessa do `invalidateQueries(authKeys.all)`, então o `mutateAsync` só resolve depois do `/auth/me` novo. Sem isso, a tela navega para `/competencias` com o `null` antigo no cache, e o `useSuspenseQuery` do guard (que não suspende quando já há dado) manda de volta para `/entrar`.
  - **`/auth/me` com 401/403/404 = sem Contador.** É o que o Responsável logado recebe; o Vue engolia qualquer erro. Erro de rede ou 5xx agora vira o `ErrorState` do segmento em vez de um redirect mudo para o login.
  - **Sair** remove todas as queries que não são de sessão (nada do tenant fica no cache) e faz `resetQueries(authKeys.all)`. Só `clear()` deixava o `SessionProvider`, que fica acima do router, mostrando o Contador antigo até algo re-renderizá-lo. O teste cobre os dois lados.
  - O `authClient` passa `customFetchImpl: (input, init) => fetch(input, init)`: o `better-fetch` guarda o `fetch` na importação, e sem isso o MSW não intercepta as chamadas de login nos testes. O `auth-client.ts` entrou na exceção de `fetch` do lint (infra HTTP, como o api-client).
  - A rota `*` passou a usar a `NotFoundPage` direto (sem `lazy`), o que acabou com o aviso do Vite de import estático + dinâmico do mesmo módulo. São 29 páginas lazy.
  - O ticket pede "Contador em `/minha-area/pendencias` → `/minha-area/acesso`". O `RequireContact` faz isso (teste isolado), mas com as rotas reais o `/minha-area/acesso` é `GuestOnly` e manda o Contador para `/competencias`, exatamente como o `beforeEach` do Vue. Os dois casos estão testados.
- **Testes:** `derive-session.spec.ts` (`isOverdue` nos quatro ramos: OVERDUE, CANCELED antes/depois do fim do período, trial vencido/em curso, ativa/ausente; `can()` false antes do `/me`), `session-provider.spec.tsx` (loading → ready, Responsável só sem Contador, sign-in invalida e a sessão passa a ter o Contador, sign-in recusado com "E-mail ou senha inválidos.", sign-out limpa o cache inteiro e zera a sessão), `guards.spec.tsx` (sem sessão → `/entrar` com `from`; Responsável em `/entrar` e em `/competencias` → `/minha-area/pendencias`; Contador e o `RequireContact`). 77 testes no pacote. `grep -r useState shared/session features/auth/queries` vazio.
- **Bundle (ponto de partida para o M10.4):** o chunk principal do React tem 559 kB (o do Vue, 332 kB); o `vite build` avisa do limite de 500 kB. Não otimizado aqui.
- **Ficou de fora:** nada do escopo. As telas de login, cadastro, senha e convite são M1.2–M1.5.
- **Tempo:** ~1h30.

---

## M1.2 · COM-329 · Tela de entrada do Contador (`/entrar`)

- **Data:** 2026-11-07
- **Branch:** `feat/COM-329-login` (a partir de `feat/COM-327-session-guards`)
- **O que foi feito:** `features/auth/components/login-page.tsx` (rota `app/routes/login.tsx`): React Hook Form + `zodResolver` com o mesmo schema local do Vue (`email()` do contrato + senha obrigatória), `mode: 'onTouched'` (o erro do campo aparece depois de tocá-lo, como o `meta.touched` do vee-validate), botão desabilitado enquanto inválido ou enviando, erro de credencial no topo com `role="alert"` lido de `signIn.error` (sem `useState`), e `navigate(from ?? '/competencias', { replace: true })` depois do sucesso. Textos, links e o painel escuro de benefícios iguais ao Vue.
- **Testes:** `login-page.spec.tsx` (rotas reais + MSW): senha errada → "E-mail ou senha inválidos." e continua em `/entrar`; senha certa → `/competencias`; botão desabilitado com o formulário vazio; `autocomplete`/`inputmode`; erro de campo depois do blur ("E-mail inválido.", a primeira issue do schema, a mesma que o Vue mostrava). O teste de guard passou a procurar o título real da página. 81 testes no pacote.
- **Visual:** `entrar__{desktop,mobile}__inicial.png` em `baseline-react-2026-11/`, iguais aos do Vue lado a lado.
- **Ambiente local de comparação:** API do worktree na 3100 com `TRUSTED_ORIGINS=http://localhost:5174` no `.env` local (ignorado pelo git), React na 5174.
- **Ficou de fora:** nada.
- **Tempo:** ~25 min.

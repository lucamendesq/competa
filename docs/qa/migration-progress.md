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

## M0.10 · COM-323 · CI do web-react e staging servindo o React

- **Data:** 2026-11-07
- **Branch:** `feat/COM-323-ci-web-react` (a partir de `feat/COM-320-router`) · **PR:** [#29](https://github.com/lucamendesq/competa/pull/29)
- **O que foi feito:** `ci.yml` roda `pnpm --filter web-react typecheck` e `test` no job `test` (o `build-lint` já cobria lint, format e `pnpm -r build`). O job `deploy-web-staging` passou a publicar o `apps/web-react` no projeto que já existe, `competa-web-staging` (`staging-app.competa.com.br`). A produção (`deploy-web`) continua com o Vue até o cutover. `docs/deploy.md` › Staging registra isso.
- **Decisões:**
  - **Sem projeto de preview à parte** (decisão do Luca): o plano criava o `competa-web-react-staging`; o staging que já existe passa a servir o React. Mesmo domínio, mesma API e a origem já liberada, então não sobra passo de painel. Consequência aceita: as telas ainda não migradas aparecem como placeholder no staging até os tickets delas.
  - A primeira versão do ticket (job `deploy-web-react-staging` + projeto novo) ficou no histórico do PR; o commit seguinte troca pelo staging existente. As branches M1.1 e M1.2 receberam a mudança por merge (sem reescrever histórico já publicado).
- **Falta conferir depois do merge na `main`:** abrir `https://staging-app.competa.com.br/termos` e ver `GET /auth/me` sem erro de CORS no console.
- **CI:** os PRs da cadeia passam em `build-lint` e `test`.
- **Tempo:** ~30 min.

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
- **Branch:** `feat/COM-329-login` (a partir de `feat/COM-327-session-guards`) · **PR:** [#31](https://github.com/lucamendesq/competa/pull/31)
- **O que foi feito:** `features/auth/components/login-page.tsx` (rota `app/routes/login.tsx`): React Hook Form + `zodResolver` com o mesmo schema local do Vue (`email()` do contrato + senha obrigatória), `mode: 'onTouched'` (o erro do campo aparece depois de tocá-lo, como o `meta.touched` do vee-validate), botão desabilitado enquanto inválido ou enviando, erro de credencial no topo com `role="alert"` lido de `signIn.error` (sem `useState`), e `navigate(from ?? '/competencias', { replace: true })` depois do sucesso. Textos, links e o painel escuro de benefícios iguais ao Vue.
- **Testes:** `login-page.spec.tsx` (rotas reais + MSW): senha errada → "E-mail ou senha inválidos." e continua em `/entrar`; senha certa → `/competencias`; botão desabilitado com o formulário vazio; `autocomplete`/`inputmode`; erro de campo depois do blur ("E-mail inválido.", a primeira issue do schema, a mesma que o Vue mostrava). O teste de guard passou a procurar o título real da página. 81 testes no pacote.
- **Visual:** `entrar__{desktop,mobile}__inicial.png` em `baseline-react-2026-11/`, iguais aos do Vue lado a lado.
- **Ambiente local de comparação:** API do worktree na 3100 com `TRUSTED_ORIGINS=http://localhost:5174` no `.env` local (ignorado pelo git), React na 5174.
- **Ficou de fora:** nada.
- **Tempo:** ~25 min.

---

## M1.3 · COM-330 · Cadastro público da Contabilidade (`/cadastro`)

- **Data:** 2026-11-07
- **Branch:** `feat/COM-330-register` (a partir de `feat/COM-329-login`) · **PR:** [#32](https://github.com/lucamendesq/competa/pull/32)
- **O que foi feito:** `features/auth/components/register-page.tsx` (rota `app/routes/register.tsx`). Um `useForm` com o schema completo do Vue (`PublicSignUpBody` + `email()` + `newPassword()` + CNPJ opcional), passo em `useState<'user' | 'firm'>`, `stepOneValid` e `firmNameValid` derivados no render a partir de `useWatch` (sem efeito). Enter no passo 1 avança em vez de enviar; "Continuar" valida e marca os três campos (`trigger`). CNPJ com `cnpjInputMask` num `Controller`. `useRegisterFirm` (com o fallback de sign-in do store) → `/competencias`. 422 do servidor vai para o campo com `applyFieldErrors` e a mensagem geral aparece no topo com `apiErrorMessage`, como no Vue.
- **Refatoração dentro da feature:** o painel escuro de benefícios, o asterisco de obrigatório e o alerta de erro viraram `auth-shell.tsx` (`AuthShell`, `RequiredMark`, `FormAlert`), porque login e cadastro são dois consumidores reais. O login passou a usar e os testes dele continuam verdes.
- **Decisões:**
  - **Sem checkbox de termos.** O ticket pede um checkbox que bloqueie o envio, mas o `RegisterPage.vue` (a especificação) não tem: só os links "Termos de Uso · Privacidade" no rodapé, que foram mantidos. Nem o contrato (`PublicSignUpBody`) nem a API registram aceite. Criar esse portão é decisão de produto (ver COM-230, achado de QA sobre o aceite dos termos). O `TermsConsent.vue` só é usado no convite (M1.5) e no envio (M8.3) e nasce no M1.5, com o primeiro consumidor.
  - Os dois passos ficam montados, e o inativo recebe `hidden` (o `v-show` do Vue). Desmontar o passo 1 apagava o valor dos inputs ao voltar.
  - A máscara do CNPJ é nova (o Vue só tinha o placeholder); o ticket pede `cnpjInputMask` e o schema aceita o valor mascarado.
- **Testes:** `register-page.spec.tsx` (rotas reais + MSW): "Continuar" desabilitado até o passo 1 ser válido; Enter no passo 1 avança sem chamar a API; voltar preserva os valores dos dois passos; máscara do CNPJ; 422 em `cnpj` aparece no campo (`aria-invalid` + descrição); sucesso envia o corpo sem `cnpj` vazio e vai para `/competencias`; links de Termos e Privacidade. 87 testes no pacote.
- **Visual:** `cadastro__{desktop,mobile}__{passo-1,passo-2}.png`, iguais aos do Vue.
- **Ficou de fora:** o portão de aceite dos termos (decisão de produto, acima).
- **Tempo:** ~50 min.

---

## M1.4 · COM-331 · Esqueci minha senha e redefinir senha

- **Data:** 2026-11-07
- **Branch:** `feat/COM-331-password` (a partir de `feat/COM-330-register`) · **PR:** [#33](https://github.com/lucamendesq/competa/pull/33)
- **O que foi feito:** `features/auth/components/forgot-password-page.tsx` e `reset-password-page.tsx` (rotas `forgot-password.tsx`, `reset-password.tsx`). O "esqueci" usa `useRequestPasswordReset` (`redirectTo: ${location.origin}/redefinir-senha`) e troca para "Verifique seu e-mail" pelo `isSuccess` da mutation. O "redefinir" lê `?token=` com `useSearchParams`; "link inválido" quando não há token, quando vem `?error=` ou quando a API responde `INVALID_TOKEN`; "Senha alterada" quando o resultado é `done`. Todos os estados saem do resultado da mutation, sem `useState`. Textos e botões iguais ao Vue.
- **Refatoração dentro da feature:** `AuthCard` (cartão centrado com o logo) e `StatusIcon` entram no `auth-shell.tsx`; as duas páginas usam.
- **Decisões:** os botões "Voltar para o login", "Pedir novo link" e "Entrar no painel" viraram links (`Button asChild` + `Link`) em vez de botão com `router.push`, o que dá `href` e abre em nova aba. O e-mail do "esqueci" ganhou `autocomplete="email"`/`inputmode="email"` e a nova senha `autocomplete="new-password"`, que o Vue não tinha; o visual não muda.
- **Testes:** `password-pages.spec.tsx` (rotas reais + MSW): o "esqueci" mostra a mesma resposta para e-mail existente e inexistente e manda o `redirectTo` certo; sem token → link inválido com "Pedir novo link"; `INVALID_TOKEN` → link inválido; sucesso → "Senha alterada" com link para `/entrar`; outro erro → mensagem do store e o formulário continua. 93 testes no pacote.
- **Visual:** `esqueci-senha__{desktop,mobile}__{inicial,enviado}.png` e `redefinir-senha__{desktop,mobile}__invalido.png`, iguais aos do Vue (o "enviado" passou pela API local de verdade).
- **Ficou de fora:** nada.
- **Tempo:** ~30 min.

---

## M1.5 · COM-332 · Aceitar convite (`/convite/:linkToken`)

- **Data:** 2026-11-07
- **Branch:** `feat/COM-332-invite` (a partir de `feat/COM-331-password`) · **PR:** [#34](https://github.com/lucamendesq/competa/pull/34)
- **O que foi feito:** `features/auth/components/invite-page.tsx` (rota `app/routes/invite.tsx`). O token vem de `useParams`; o convite é `useInviteQuery(token)` sobre o `GET /invites/:token` (`authKeys.invite(token)`), com os estados "Carregando convite…", "Convite inválido" e o formulário. `useAcceptInvite` faz o que o Vue fazia em sequência: `POST /auth/sign-up` (Contador) ou `POST /invites/:token/contact-account` (Responsável), sign-in com e-mail e senha e recarga da sessão; depois `/competencias` ou `/minha-area/pendencias`. `TermsConsent` nasce em `features/auth/components/terms-consent.tsx` (primeiro consumidor).
- **Decisões (o Vue é a especificação onde o ticket diverge):**
  - **Convite usado ou vencido mostra a tela "Convite inválido"** com a mensagem da API e o botão "Ir para o login", que aponta para `/minha-area/acesso` quando o erro traz `details.target = 'company'` e para `/entrar` no resto. O ticket pedia `Navigate` automático + toast; o Vue (commit `f74c48b`, "convite de Responsável já usado manda para a Minha Área") mostra a tela e deixa o usuário clicar.
  - **Senha obrigatória nos dois fluxos**, como no Vue (`newPassword`). O contrato aceitaria Responsável sem senha (D14), mas a tela atual não oferece esse caminho; mudar isso é decisão de produto.
  - `TermsConsent` vai para `shared/` quando o envio público (M8.3) virar o segundo consumidor.
- **Testes:** `invite-page.spec.tsx` (rotas reais + MSW): 409 de Responsável → "Convite inválido" com link para `/minha-area/acesso`; 410 de Contador → link para `/entrar`; Contador aceita (corpo do sign-up conferido) e cai em `/competencias`; Responsável aceita (corpo do `contact-account` conferido) e cai em `/minha-area/pendencias`; senha obrigatória e links dos termos. 98 testes no pacote.
- **Visual:** `convite-token__{desktop,mobile}__contador.png`, iguais aos do Vue (convite local gerado com `create-firm` para o mesmo nome e e-mail do baseline). O baseline não tem o convite de Responsável; o teste cobre o texto dele.
- **Ficou de fora:** nada do escopo.
- **Tempo:** ~35 min.

---

## M2.1 · COM-333 · PanelLayout

- **Data:** 2026-11-07
- **Branch:** `feat/COM-333-panel-layout` (a partir de `feat/COM-332-invite`) · **PR:** [#35](https://github.com/lucamendesq/competa/pull/35)
- **O que foi feito:** `shared/components/layout/panel-layout.tsx` com a marcação e as classes do `PanelLayout.vue`: skip link "Pular para o conteúdo", header mobile com botão de menu (`aria-expanded`, `aria-controls`), overlay, nav com os 7 itens (`NavLink` com as classes de ativo do Vue), bloco de perfil com iniciais e menu ("Convidar contador" só para o dono; "Sair"), `Callout` de assinatura pendente com "Regularizar agora", `main#conteudo`. `menuOpen` e `profileOpen` em `useState` local. `app/router/panel-shell.tsx` liga o layout à sessão (`useSession`), ao `useSignOut` (depois → `/entrar`) e ao indicador de escrita em voo; a rota `/` ficou `RequireAccountant` → `PanelShell` → segmento com `errorElement`, então o erro de uma página aparece dentro do layout.
- **Decisões:**
  - **O layout é apresentacional em `shared/`** e a composição fica em `app/router/panel-shell.tsx`: o ticket punha `useSignOut` dentro de `shared/`, mas ele mora em `features/auth`, e `shared` não importa feature (lint).
  - **Escrita em voo:** o Vue não mostrava nada visível com o `isBusy` (só travava os botões). Seguindo o ticket, o layout marca `aria-busy` no `main`. O hook `useWritesInFlight()` (`useIsMutating() > 0`) mora em `shared/lib/query-client.ts`, o único lugar de `shared` liberado para o TanStack.
- **Testes:** `panel-layout.spec.tsx`: menu mobile abre/fecha pelo botão e pelo overlay (com `aria-expanded`); link ativo com `bg-brand-light text-brand-strong`; iniciais; "Convidar contador" só para o dono; "Sair" chama o handler; aviso de inadimplência só com `isOverdue`; skip link é o primeiro foco e aponta para `#conteudo`; `aria-busy` com escrita em voo. 106 testes no pacote.
- **Visual:** `competencias__{desktop,mobile}__layout.png` e `competencias__mobile__menu-aberto.png`, logado como o dono do baseline na API local. Sidebar, header mobile e menu aberto iguais ao Vue. O miolo ainda é o placeholder "Periods" (M2.3); por isso as capturas com o miolo levam o nome `layout` em vez de `com-dados`, que o M2.3 vai gerar.
- **Ficou de fora:** nada.
- **Tempo:** ~40 min.

---

## M2.2 · COM-324 · `features/periods`: api, key factory e hooks

- **Data:** 2026-11-07
- **Branch:** `feat/COM-324-periods-feature` (a partir de `feat/COM-333-panel-layout`) · **PR:** [#36](https://github.com/lucamendesq/competa/pull/36)
- **O que foi feito:** `features/periods/api/` com um arquivo por chamada (16 chamadas dos `api/periods.ts` e `api/requests.ts` do Vue + `period.types.ts`), `queries/period-keys.ts` (`periodKeys` e `requestKeys` como no ticket), `use-period-queries.ts` (lista com `keepPreviousData`, detalhe, painel, prévia, Solicitação) e `use-period-mutations.ts`. A feature `requests` do Vue foi absorvida aqui, como o plano manda. Sem UI.
- **Invalidação por mutation** (testada com spy, exatamente estas keys): abrir → `lists()`; incluir empresas novas → `lists()` + `detail(id)`; encerrar competência → `lists()` + `detail(id)`; cobrar atrasados → `panel(id)`; publicar revisão e desfazer aceite → `requestKeys.detail` + `periodKeys.panel`; encerrar Solicitação → `requestKeys.detail` + `periodKeys.panel` + `periodKeys.detail`; reenviar link, gerar link, zips e abrir documento → nada.
- **Decisões:**
  - `useUploadLink` é **mutation**, não query: o `POST /requests/:id/upload-link` rotaciona o link (a API só guarda o hash). A key `requestKeys.uploadLink` fica na fábrica como o ticket pede, sem uso por enquanto.
  - O ticket não lista keys para "incluir empresas novas" (`POST /periods/:id/requests`); invalida a lista (contagem de Solicitações) e o detalhe, que cobre o painel por prefixo.
  - Validação de borda com `parsed` só onde o contrato descreve a resposta inteira (`PanelRowResponse[]`, `RequestDetailResponse`): o zod descarta campo desconhecido, e o detalhe da competência tem campos (`deliveredCount`) que o contrato não lista.
  - A prévia (`usePeriodPreview`) só busca com `enabled` vindo da tela **e** mês `YYYY-MM` válido.
- **Testes:** `use-period-mutations.spec.tsx` (um caso por hook de escrita, spy em `invalidateQueries`) e `use-period-queries.spec.tsx` (páginas com keys distintas e a anterior visível como `placeholderData` enquanto a próxima carrega; prévia só com diálogo aberto e mês válido). `grep "queryKey: \[" src` fora de testes: vazio. 116 testes no pacote.
- **Ficou de fora:** nada (UI é M2.3/M2.4/M3.1).
- **Tempo:** ~35 min.

---

## M2.3 · COM-336 · Lista de Competências (`/competencias`)

- **Data:** 2026-11-07/08
- **Branch:** `feat/COM-336-periods-list` (a partir de `feat/COM-324-periods-feature`) · **PR:** [#37](https://github.com/lucamendesq/competa/pull/37)
- **O que foi feito:** `features/periods/components/{periods-list-page,period-kpis,periods-table,open-period-dialog,period-opening-summary}.tsx` (rota `app/routes/periods.tsx`), com textos, toasts e classes do `PeriodsListPage.vue`. KPI da competência ativa (a aberta mais recente, com "x de y entregues" do detalhe), chips de status, tabela com zip e encerrar, `PlanGateNotice` quando o plano não tem `periodZip`. Diálogo de abertura com seletor de ano/mês (botões + selects ocultos com `aria-label`, como no Vue), prazo opcional validado pelo `OpenPeriodBody`, prévia do fan-out (`usePeriodPreview`), aviso de "já aberta" e de empresas sem template, passo de confirmação e o resumo com "Copiar link" por Empresa. Estados `isPending`/`isError`/vazio explícitos.
- **Peças compartilhadas novas:** `shared/components/plan-gate-notice.tsx` (usado por várias features, só depende dos contratos) e `shared/hooks/use-copy.ts`.
- **Decisões:**
  - **Paginação nova:** o Vue buscava só a página 1 (20 competências) e não tinha controle de página. Seguindo o ticket, a página vai para `?page=` e o `Pagination` aparece quando há mais de 20.
  - **Filtro de status na URL** (`?status=open|closed`), pela regra "URL para filtro/página/aba"; no Vue era estado local.
  - O conteúdo do diálogo só monta com o diálogo aberto (o Radix desmonta ao fechar), então o formulário e o passo começam limpos a cada abertura sem efeito. A prévia roda só enquanto o diálogo está aberto e o mês é válido.
  - O formulário usa React Hook Form (`register` no prazo, `setValue` no mês/ano); o erro do prazo é derivado do `OpenPeriodBody` no render, como o Vue fazia.
  - `role="list"` explícito nas listas do diálogo foi removido (o lint `jsx-a11y/no-redundant-roles` não aceita).
- **Testes:** `periods-list-page.spec.tsx` (rotas reais + `AppProviders` + MSW): vazio; abrir chama `POST /periods` com `{ referenceMonth: '2026-10' }`, mostra o resumo e o toast e refaz a lista; trocar de página escreve `?page=2` e mantém a página anterior visível enquanto a nova carrega; encerrar pede confirmação e mostra "Encerrando…" desabilitado; zip vazio vira o toast "Nenhum documento para baixar."; sem `periodZip` o botão fica desabilitado com o aviso do plano. Handler MSW padrão de `GET /periods` (lista vazia) e os testes das outras telas passaram a procurar o título real "Competências". 122 testes no pacote.
- **Visual:** `competencias__{desktop,mobile}__{vazio,com-dados,modal-abertura}.png`, iguais aos do Vue. Diferença só de dado: o banco local ganhou duas Empresas sem template (sobras da importação feita na captura do baseline), então a prévia lista mais nomes.
- **Ficou de fora:** nada do escopo.
- **Tempo:** ~1h15.

---

## M2.4 · COM-348 · Painel de Pendências (`/competencias/:id/pendencias`)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-348-pending-panel` (a partir de `feat/COM-336-periods-list`) · **PR:** [#38](https://github.com/lucamendesq/competa/pull/38)
- **O que foi feito:** `features/periods/components/{pending-panel-page,panel-filters,panel-row,channel-failures,close-request-dialog}.tsx` + `panel-lines.ts` (derivação pura: linhas, contagens, filtros, progresso, impacto de encerrar, canais com falha). Cabeçalho com zip da competência, "Incluir empresas novas" e "Encerrar"; cartão de progresso / "Zero pendências!" / "Competência encerrada"; busca, filtro por contador e chips; linhas expansíveis com itens a enviar e a conferir, falha de canal com "Gerar novo link e reenviar e-mail", copiar link (gera um novo), zip da Empresa e encerrar a Solicitação. Os 17 textos de toast copiados do Vue. `CloseRequestDialog` nasce aqui, exportado pelo `index.ts` para o M3.1.
- **Decisões:**
  - `?contador=` e `?status=` na URL; a busca fica local (filtra no cliente a cada tecla).
  - **CNPJ por linha:** o Vue lia da lista de Empresas (100 primeiras). `periods` não pode importar `companies`, então a feature tem `get-company-cnpjs.ts` + `periodKeys.companyCnpjs()` (mesmo `GET /companies?perPage=100`). Fica o mesmo limite de 100 do Vue.
  - `useResendUploadLink` agora recebe `periodId` e invalida `periodKeys.panel(id)`, o equivalente ao `panelQuery.refetch()` do Vue (teste do M2.2 atualizado).
  - `useCopy` limpa o timer no unmount (efeito de limpeza, sincronização com um timer externo), como o ticket pede.
  - Linhas viraram `<ul>/<li>` (o Vue usava `div` com `role="list"`); títulos das seções "Aguardando Envio"/"Enviado, a conferir" são `h3` (eram `h4` sem `h3`). Barra de progresso com `role="progressbar"`.
  - `asyncUtilTimeout` do Testing Library subiu para 3 s no `setup.ts`: com a suíte inteira em paralelo, o carregamento lazy das rotas passava de 1 s e um teste de guard falhava de vez em quando (passava isolado).
- **Testes:** `pending-panel-page.spec.tsx` (rotas reais + `AppProviders` + MSW): CNPJ, "Atrasada" e falha de canal ao expandir; "Cobrar atrasados" com `busy` → aviso de cobrança em andamento; com `sent > 0` → contagem e o painel é buscado de novo; encerrar a Solicitação da linha atualiza a linha sem reload; copiar link → toast, "Link copiado!", área de transferência e volta a "Copiar link" depois de 2,5 s; `?contador=` filtra, sobrevive a ir e voltar e funciona abrindo direto pela URL. `panel-lines.spec.ts` para a derivação. 133 testes no pacote.
- **Visual:** `competencias-id-pendencias__{desktop,mobile}__{com-dados,filtro-contador}.png`, iguais aos do Vue.
- **Ficou de fora:** nada.
- **Tempo:** ~1h30.

---

## M3.1 · COM-352 · Revisão da Solicitação (`/solicitacoes/:id`)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-352-request-review` (a partir de `feat/COM-348-pending-panel`) · **PR:** [#39](https://github.com/lucamendesq/competa/pull/39)
- **O que foi feito:** `features/periods/components/{request-review-page,review-item,review-extras,review-reason,resend-notice}.tsx` + `review-draft.ts` (reducer do rascunho). Itens aguardando conferência com "Aceitar item" e "Recusar" por documento (motivo de 3 a 500 caracteres com contador), documentos extras com Aceitar/Recusar, "Demais itens" com status de exibição, "Precisa reenviar" e "Desfazer aceite", barra fixa "N decisão(ões) não publicada(s)" com Descartar/Publicar, "Encerrar" com o `CloseRequestDialog` do M2.4, "Voltar". Toasts do Vue.
- **Decisões:**
  - **Rascunho em `useReducer`** (`toggleAccept`, `toggleRejection`, `setRejection`, `clearRejection`, `toggleExtra`, `setExtraReason`, `reset`); contagem, "falta motivo" e o `ReviewBatchBody` são funções puras do estado. Aceitar um item limpa as recusas dos documentos dele (o botão continua desabilitado com recusa marcada, como no Vue).
  - **"Abrir" segue o Vue: nova aba**, com o blob vindo de `GET /documents/:id/content` (rota do Contador); o object URL é revogado depois de 60 s (o Vue nunca revogava). Esta tela não tem preview embutido, então o `DocumentPreview` com `react-error-boundary` fica para o M9.4, onde o preview existe.
  - O ticket cita zip da Solicitação nesta tela, mas o `RequestReviewPage.vue` não tem; não foi acrescentado.
  - Botões de decisão têm `aria-pressed` e nome com o item/arquivo ("Aceitar item: Aluguel", "Recusar: arquivo.pdf").
- **Testes:** `review-draft.spec.ts` (aceitar limpa a recusa; recusar desmarca o aceite; extras; reset zera; motivo mínimo e o lote com os três grupos) e `request-review-page.spec.tsx` (publicar envia aceite + recusa + extra, mostra o toast, zera o rascunho e o detalhe é buscado de novo; abrir documento chama só `/documents/:id/content` e abre o blob em nova aba; Descartar). 141 testes no pacote.
- **Visual:** `solicitacoes-id__{desktop,mobile}__com-rejeicao.png`, iguais aos do Vue. Diferença de dado: o banco local tem 3 extras (dois enviados durante a captura do baseline). Os estados "com pendentes" não foram recapturados porque a cena local já está depois da revisão; o teste cobre esse estado.
- **Ficou de fora:** nada do escopo.
- **Tempo:** ~1h.

---

## M4.1 · COM-325 · `features/companies`: api, keys, hooks e store `invited-companies`

- **Data:** 2026-11-08
- **Branch:** `feat/COM-325-companies-feature` (a partir de `feat/COM-352-request-review`) · **PR:** [#40](https://github.com/lucamendesq/competa/pull/40)
- **O que foi feito:** `features/companies/api/` (as 22 chamadas do `companies.ts` do Vue, agrupadas por recurso: listas, detalhe, checklist efetivo, overrides, acessos, uso do plano, criar/editar/desativar, Responsáveis, ações em lote, importação; `company.types.ts`), `queries/company-keys.ts`, `use-company-queries.ts` (lista com `keepPreviousData`, detalhe, acessos, checklist efetivo, overrides, uso do plano) e `use-company-mutations.ts` com a invalidação do ticket. `store/invited-companies.store.ts` (Zustand + `persist` em `sessionStorage`, `partialize` só de `invitedIds`, `markInvited(ids)`, `useIsInvited(id)`). Sem UI.
- **Decisões:**
  - `accesses(id)`, `checklist(id)` e `overrides(id)` não ficam debaixo de `detail(id)`: assim invalidar o detalhe (ex.: adicionar Responsável) não refaz o checklist e os acessos por prefixo. A invalidação fica exatamente a do ticket.
  - **A chave real do Vue é `competa_invited_companies`** (o ticket chutava `competa:invited`) e o valor é um array JSON puro. O `persist` do Zustand grava `{ state, version }`, então o store usa um `PersistStorage` próprio que lê e grava o array no formato do Vue; o que a aba já tinha gravado continua valendo.
  - O `usePlanUsage` do Vue ficava sob o prefixo `companies` para ser invalidado por qualquer mutação; aqui ele é invalidado só pelas mutações que mudam a contagem (criar, desativar, ativar, importar).
- **Testes:** `use-company-mutations.spec.tsx` (14 mutations, spy em `invalidateQueries`, keys exatas; buscas `'a'` e `'ab'` com keys distintas) e `invited-companies.store.spec.ts` (`markInvited` imutável e sem duplicar; persiste na chave e no formato do Vue; reidrata o que o Vue gravou). 159 testes no pacote.
- **Ficou de fora:** nada (UI é M4.2–M4.5).
- **Tempo:** ~35 min.

---

## M4.4 · COM-337 · Feature-folha `catalog` e Checklist da Empresa

- **Data:** 2026-11-08
- **Branch:** `feat/COM-337-catalog-company-checklist` (a partir de `feat/COM-325-companies-feature`) · **PR:** [#41](https://github.com/lucamendesq/competa/pull/41)
- **Ordem:** pela fila (topológica + código M) o próximo seria o M4.3, mas o formulário de Empresa usa a lista de templates, que mora no `catalog` (este ticket), e `companies` só pode importar `catalog`. O M4.4 veio antes do M4.3.
- **O que foi feito:** `features/catalog/` (tipos de documento e templates como opções: `api/`, `catalogKeys`, `useDocumentTypes`, `useTemplateOptions`, `CatalogPicker` + `filterCatalog`) e `features/companies/components/{company-checklist-page,checklist-line,checklist-lines}` (rota `/empresas/:id/checklist`): checklist efetivo agrupado por categoria com a origem de cada linha, switch para tirar/voltar item, "Adicionar documento" pelo catálogo, "Restaurar padrão do template", aviso "Empresa cadastrada. Falta um ajuste?" com `?created=1`. Toasts do Vue.
- **Decisões (o Vue é a especificação onde o ticket diverge):**
  - O `CatalogPicker.vue` é uma busca por nome sobre os 100 primeiros tipos, sem categoria nem paginação; o React faz igual. O critério "trocar categoria reseta a página" não se aplica. O "reset por derivação" vale para a busca: a lista filtrada é calculada no render.
  - A página do Vue só liga/desliga itens (override `add`/`remove` com `monthly`, `dueMonthOffset: 1`, `required: true`); não edita periodicidade/prazo. Sem `override-form`.
  - O `catalog` ainda não tem invalidação: as mutations de template (M5.1) vão invalidar `catalogKeys.templates()`.
- **Testes:** `company-checklist-page.spec.tsx` (adicionar pelo catálogo envia o override, refaz checklist e overrides e a linha aparece com "Adicionado"; a busca filtra; desligar um item do template cria o override `remove`). 162 testes no pacote.
- **Visual:** `empresas-id-checklist__{desktop,mobile}__{com-override,picker-aberto}.png`, iguais aos do Vue. Diferenças: a lupa do picker é um pouco menor (ícone `size-4`); o menu lateral marca "Empresas" também nas subpáginas da Empresa (`NavLink` casa por prefixo; o `RouterLink` do Vue só marcava a rota exata).
- **Ficou de fora:** nada.
- **Tempo:** ~50 min.

---

## M4.3 · COM-338 · Formulário de Empresa (nova e editar)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-338-company-form` (a partir de `feat/COM-337-catalog-company-checklist`) · **PR:** [#42](https://github.com/lucamendesq/competa/pull/42)
- **O que foi feito:** `features/companies/components/{company-form-page,company-form,company-form-schema,checklist-preview-panel,effective-checklist-preview,contact-access-list,revoke-access-dialog}` nas rotas `/empresas/nova` e `/empresas/:id/editar`. RHF + `zodResolver` com o schema do Vue (nome do `CreateCompanyBody`, CNPJ incompleto, e-mail obrigatório quando há nome de contato), máscaras de CNPJ e WhatsApp, flags do contrato, Contador responsável (`GET /accountants`), template pelo `catalog` (`useTemplateOptions`, primeiro consumidor) e a prévia do checklist (checklist efetivo quando o template não mudou, senão `GET /checklist-templates/:id` via o novo `useTemplatePreview` do `catalog`), filtrada pelas flags e agrupada por categoria. "Acesso ao app" com "Revogar acesso" e confirmação. Salvar segue o Vue: editar = `PATCH` (vazios como `null`) + sincroniza o Responsável (add/patch/delete, toast de links não entregues) → `/empresas`; criar = `POST` → `/empresas/:id/checklist?created=1` com template, senão `/empresas`. Erros: Callout + erros por campo (`contact.*` → `contact*`).
- **Decisões:**
  - O formulário monta só depois do `useCompany` resolver, com `key={id}` e `defaultValues` (sem `reset` em efeito).
  - Os `<select>` remontam quando as opções chegam (`key` ready/loading): sem isso o select não controlado ficava em "Sem template" porque o valor salvo ainda não existia entre as opções. A primeira captura pegou o bug; o teste agora cobre.
  - `useEffectiveChecklist` e `useCompanyAccesses` ficam desligados com id vazio (tela de criação).
  - A lista de Contadores é uma chamada de `companies` (`getAccountantOptions`), porque `companies` não pode importar `team`.
- **Testes:** `company-form-page.spec.tsx` (criar com template: máscara, prévia filtrada por flag, corpo enviado e redirect com `created=1`; contato sem e-mail bloqueia; editar carrega valores mascarados e o template, manda `null` nos vazios e avisa links não entregues; revogar acesso; 404). 167 testes no pacote.
- **Visual:** `empresas-nova__{desktop,mobile}__inicial.png` e `empresas-id-editar__{desktop,mobile}__dois-responsaveis.png`, iguais aos do Vue.
- **Ficou de fora:** nada.
- **Tempo:** ~1h.

---

## M4.2 · COM-349 · Lista de Empresas (`/empresas`)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-349-companies-list` (a partir de `feat/COM-338-company-form`) · **PR:** [#43](https://github.com/lucamendesq/competa/pull/43)
- **O que foi feito:** `features/companies/components/{companies-list-page,companies-results,companies-table,bulk-actions-bar,contact-status,invite-to-app-button,plan-cap-banner}`. Filtros na URL (`?page=`, `?ativas=true|false`, `?busca=`); a busca tem estado local para o input e um `useDebouncedCallback` (300 ms, novo em `shared/hooks`) que escreve na URL. Abas com as contagens do `usePlanUsage`. Seleção em lote com "Ativar selecionadas", "Aplicar template" e "Limpar seleção"; por linha: Editar, Checklist, "Convidar para o app" (marca no store `invited-companies`), Desativar (com confirmação) e Reativar (`useReactivateCompany`, nova mutation). `PlanCapBanner` quando passa do teto. Vazio com e sem filtro, erro e carregando. Toasts do Vue.
- **Decisões:**
  - Nenhum `useEffect` para filtros: a URL é a fonte, e mudar busca ou aba apaga `page`. A seleção vive num filho com `key` de aba + busca + página, então limpa sozinha ao mudar o filtro (no Vue ela ficava, e "selecionar todas" só via a página atual).
  - O toast de "aplicar template" usa o `updated` da API, como pede o ticket (o Vue contava a seleção).
  - O `PlanGateNotice` não aparece na lista do Vue; não foi acrescentado.
- **Testes:** `companies-list-page.spec.tsx` (busca escreve `?busca=` depois do debounce com uma única query filtrada; abas escrevem `?ativas=` e mostram as contagens; convidar marca a Empresa e a marca sobrevive a remount; aplicar template envia as selecionadas, toast com `updated`, limpa a seleção; desativar com confirmação; vazio + banner de teto). 173 testes no pacote.
- **Visual:** `empresas__{desktop,mobile}__{com-dados,inativas,com-selecao}.png`, iguais aos do Vue. Diferença de dado: o banco local tem duas "Empresa Nova Ltda" criadas em capturas anteriores. O estado vazio não foi recapturado (o banco tem dados); o teste cobre.
- **Ficou de fora:** nada.
- **Tempo:** ~50 min.

---

## M4.5 · COM-339 · Importar planilha de Empresas (`/empresas/importar`)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-339-import-companies` (a partir de `feat/COM-349-companies-list`) · **PR:** [#44](https://github.com/lucamendesq/competa/pull/44)
- **O que foi feito:** `features/companies/utils/spreadsheet.ts` (`readSpreadsheet(file)`: `.xlsx` via `import('xlsx')` lazy, só a primeira aba, `sheet_to_csv({ rawNumbers: true })`; `.csv` como texto; demais extensões dão "Envie um arquivo .csv ou .xlsx."; colunas esperadas e o CSV modelo com BOM e `;`) e `components/{import-companies-page,import-state,spreadsheet-dropzone,import-columns,import-preview-table,import-report}`. Estado da tela em `useReducer` (`idle → reading → idle(com arquivo) → previewing → done`, com `error`). Prévia por linha, divisão ativa/inativa pelo teto do plano (o padrão "ativar" é derivado do uso enquanto o Contador não mexe, sem efeito), "Enviar convites de acesso" (confirma junto) e "Importar N empresas", com uma confirmação em voo só (os dois botões compartilham a mesma promessa, como no Vue). Descartar com confirmação. A dropzone fica dentro de `react-error-boundary`.
- **Decisões:**
  - `testing/setup.ts` ganhou `Blob.prototype.text/arrayBuffer` via `FileReader`: o jsdom não tem esses métodos, e o código de produção usa a API do navegador.
  - O SheetJS lê texto solto como CSV, então um ".xlsx" que é texto não falha (igual no Vue); o erro "Não foi possível ler esta planilha…" só aparece quando a lib lança.
- **Testes:** `spreadsheet.spec.ts` (xlsx de duas abas lê só a primeira com números crus; csv; extensão desconhecida; cabeçalho do modelo) e `import-companies-page.spec.tsx` (lê, mostra a prévia por linha e confirma com `activate: true` → toast e `/empresas`; lote acima do teto desmarca "ativar" e enviar convites confirma uma vez só com `activate: false`; extensão desconhecida; descartar). A invalidação de `lists()`/`usage()` está na mutation do M4.1 (testada lá). 181 testes no pacote.
- **Bundle:** `xlsx-*.js` (500 kB) é um chunk separado, importado só pelo chunk `spreadsheet-*.js` desta rota (`import("./xlsx-…")`); não entra no `index`.
- **Visual:** `empresas-importar__{desktop,mobile}__{inicial,previa-com-erro}.png`, iguais aos do Vue (só muda "você já tem N", que vem do banco). O "relatório" do baseline é a lista de Empresas depois de confirmar; não foi recapturado para não criar outra Empresa no banco de baseline. O teste cobre a confirmação.
- **Ficou de fora:** nada.
- **Tempo:** ~1h.

---

## M5.1 · COM-350 · `features/checklists`: api, keys e hooks de templates

- **Data:** 2026-11-08
- **Branch:** `feat/COM-350-checklists-feature` (a partir de `feat/COM-339-import-companies`) · **PR:** [#45](https://github.com/lucamendesq/competa/pull/45)
- **O que foi feito:** `features/checklists/api/` (uma chamada por arquivo: buscar, criar, renomear, derivar e excluir template; adicionar, editar e remover item; `template.types.ts`), `queries/template-keys.ts` (`all/details()/detail(id)`), `useTemplate(id)` e as mutations com a invalidação do ticket. Sem UI.
- **Decisões:**
  - A lista de templates continua em `catalogKeys.templates()` (M4.4); `checklists` importa `catalog` para invalidá-la.
  - As mutations de item também invalidam `catalogKeys.templates()` (a lista mostra a contagem de itens) e `catalogKeys.templatePreview(id)` (a prévia do formulário de Empresa, M4.3), para não deixar essas telas com dado velho.
  - Excluir faz `removeQueries(detail(id))` em vez de invalidar: o template não existe mais.
- **Testes:** `use-template-mutations.spec.tsx` (keys exatas de cada mutation; excluir remove o detalhe; derivar com nome manda o nome). 189 testes no pacote.
- **Ficou de fora:** nada (UI é o M5.2).
- **Tempo:** ~20 min.

---

## M5.2 · COM-353 · Lista de templates e editor (`/templates`, `/templates/:id`)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-353-templates-pages` (a partir de `feat/COM-350-checklists-feature`) · **PR:** [#46](https://github.com/lucamendesq/competa/pull/46)
- **O que foi feito:** `features/checklists/components/{checklists-list-page,template-name-dialog,template-editor-page,template-editor-header,template-editor,template-item-row,template-draft,leave-guard}`. Lista com "Padrão Competa", itens, empresas usando, Ver/Editar, Duplicar (diálogo com "(Cópia)") e "Criar checklist" em branco; os dois navegam para o template novo. Editor com rascunho local (nome + itens + removidos) num `useReducer` (`template-draft.ts`, funções puras de "modificado" e contagem de pendências), barra "Alterações não salvas" com Descartar/Salvar, adicionar pelo `CatalogPicker` (diálogo com "Fechar"), lixeira nomeada por item com confirmação, "Excluir template inteiro", template do produto somente leitura com "Duplicar para editar". Guard de saída com `useBlocker` + diálogo "Sair sem salvar?" (Ficar / Sair e descartar) e `beforeunload` (o único `useEffect`, assina o evento do navegador).
- **Decisões (o Vue é a especificação onde o ticket diverge):**
  - O ticket fala em RHF por item com `isDirty`; o Vue edita tudo num rascunho e salva em lote, com o "modificado" calculado contra o salvo. O React faz igual; "há alterações" é derivado do rascunho, sem estado extra.
  - O editor monta só depois do `useTemplate` resolver (`key={id}`, rascunho inicial do dado). Depois de salvar (com ou sem erro), refaz o detalhe e reseta o rascunho a partir dele, como o Vue. Refetch em segundo plano não apaga a edição.
  - O guard ignora navegação dentro da mesma rota e é desligado depois de excluir o template (para não perguntar ao ir para `/templates`).
- **Testes:** `templates-pages.spec.tsx` (duplicar pela lista navega para `/templates/:novo` e invalida `catalogKeys.templates()`; produto somente leitura; nome vazio mostra o erro no campo e não mostra "Template salvo." (COM-265); salvar envia o item alterado; sair com pendência abre o diálogo, "Ficar" mantém a rota e "Sair e descartar" navega). 194 testes no pacote.
- **Visual:** `templates__{desktop,mobile}__com-dados.png` e `templates-id__{desktop,mobile}__{produto,derivado-em-edicao,dialogo-sair}.png`, iguais aos do Vue.
- **Ficou de fora:** nada.
- **Tempo:** ~1h10.

---

## M6.1 · COM-340 · Log de Mensagens (`/mensagens`)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-340-messages` (a partir de `feat/COM-353-templates-pages`) · **PR:** [#47](https://github.com/lucamendesq/competa/pull/47)
- **O que foi feito:** `features/messages/` com `api/` (listar, reenviar, opções de Empresa para o filtro; `message.types.ts`), `messageKeys` (`lists()`, `list(query)`, `companyOptions()`), `useMessages` (com `keepPreviousData`), `useCompanyFilterOptions` (`GET /companies?perPage=100&active=true`, local à feature porque `messages` não pode importar `companies`), `useResendMessage` (invalida `lists()`) e `components/{messages-page,messages-filters,messages-table,message-query,message-labels}`. Filtros Empresa/Canal/Tipo/Status na URL (`?empresa=&canal=&tipo=&status=&page=`), lidos campo a campo com o `MessageListQuery` do contrato (valor inválido cai no padrão). Mudar filtro grava `page=1` na mesma escrita da URL. Erro de entrega abaixo da pílula, "Reenviar mensagem" com os toasts do Vue.
- **Decisões:** o filtro de Status existe no Vue e foi mantido (o ticket cita só Empresa/canal/tipo). O erro de entrega fica sempre visível na linha, como no Vue (sem "abrir").
- **Testes:** `message-query.spec.ts` (lê os filtros; inválidos caem no padrão; trocar tipo mantém canal e volta a `page=1`; limpar tira o parâmetro) e `messages-page.spec.tsx` (reenviar avisa e refaz a lista; `?canal=whatsapp&page=3` + tipo → `?canal=whatsapp&page=1&tipo=reminder` e a query vai com `page=1`; `page=abc` carrega a página 1). 201 testes no pacote.
- **Visual:** `mensagens__{desktop,mobile}__{sem-filtro,com-filtro,linha-com-erro}.png`, iguais aos do Vue. Diferença: o ícone da pílula de status é `size-3` (no Vue o SVG saía maior que o texto).
- **Ficou de fora:** nada.
- **Tempo:** ~35 min.

---

## M7.1 · COM-341 · Configurações → Contabilidade (`/configuracoes/contabilidade`)

- **Data:** 2026-11-08
- **Branch:** `feat/COM-341-firm-settings` (a partir de `feat/COM-340-messages`)
- **O que foi feito:** `features/firm/` (`api/{get-firm,update-firm,firm.types}`, `firmKeys`, `useFirm`, `useUpdateFirm`) e `components/{firm-settings-page,firm-form,firm-form-schema,reminders-fieldset}`. RHF + `zodResolver` com um schema de formulário que valida o corpo com o `UpdateFirmBody` do contrato e cobra "Preencha este campo." nos lembretes apagados; manda só os campos que mudaram ("Nada para salvar." quando nada mudou); sem `reminderTuning` os lembretes mostram o padrão e nem entram no corpo; logo com prévia e `PlanGateNotice` de `branding`. Membro vê "Somente leitura", campos desabilitados e nenhum botão de salvar. O form monta depois do `useFirm` com `key` + `defaultValues`.
- **Decisões:**
  - `features/firm` não pode importar `features/auth`, então a `Session` ganhou `refresh()`: o `SessionProvider` (em `app/`) invalida `authKeys.me()`, e o `useUpdateFirm` chama `session.refresh()` junto com a invalidação de `firmKeys.detail()`. O nome novo aparece no menu sem recarregar.
  - O `ReadOnlyNotice` do ticket é o `Callout` "Somente leitura" do Vue; fica local até o M7.3/M7.4 mostrarem se vale promover.
- **Testes:** `firm-settings-page.spec.tsx` (dono salva só o nome e o menu mostra o nome novo; lembrete apagado pede preenchimento; sem mudança avisa; membro vê campos desabilitados, aviso e o gate de `reminderTuning`). 205 testes no pacote.
- **Visual:** `configuracoes-contabilidade__{desktop,mobile}__{dono,membro}.png`, iguais aos do Vue.
- **Ficou de fora:** nada.
- **Tempo:** ~40 min.

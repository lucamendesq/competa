# Diário da migração Vue → React (`apps/web` → `apps/web-react`)

Um bloco por ticket, na ordem em que foram executados. Plano: [`docs/react-migration-2026-11.md`](../react-migration-2026-11.md). Issues: label `migration-react` no Linear (épico raiz COM-295).

## Decisões de execução que valem para a fila inteira

- **Base da cadeia é `origin/main`, não `staging`.** Em 2026-11-07 o `origin/staging` (`4380d12`) está 19 commits atrás do `main` e não tem nada próprio. O PR #19 (os achados de QA do Vue, inclusive `/mensagens`, que o plano usou como especificação) foi mergeado no `main`. Partir do `staging` daria um Vue desatualizado como especificação. Os PRs apontam para `staging`, como o Prompt B pede; até o `staging` ser atualizado com o `main`, o primeiro PR da cadeia mostra também esses 19 commits.
- **Sem permissão de merge.** O prompt não a concedeu, então os PRs são encadeados: cada branch nasce da anterior. A cadeia está registrada abaixo, ticket a ticket.
- **Linear não tem o estado "Blocked"** no time COM. Ticket parado por humano fica em **Todo** com o comentário "aguardando humano: …" e o checklist.
- **Worktree próprio** (`../competa-react`), para não mexer nos arquivos staged da branch `fix/qa-staging-findings` do checkout principal. O hook de pre-commit roda a suíte da API; o worktree usa o banco `competa_react_test` (`DB_NAME=competa_react_test git commit …`), porque o `competa_test` compartilhado não tem as migrations do `main`.
- **Bloqueador "satisfeito" = Done ou In Review com PR na cadeia.** Sem merge, nada chega a Done; exigir Done travaria a fila no M0.2. O passo 14 do Prompt B (encadear sem esperar revisão) só faz sentido com essa leitura.
- **Todo PR aponta para `staging`**, como o Prompt B pede. Como a cadeia é linear, o PR do ticket N contém os commits dos tickets anteriores; o corpo do PR diz qual é o commit do ticket.

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
- **Branch:** `feat/COM-318-api-client` (a partir de `feat/COM-317-test-infra`)
- **O que foi feito:** `shared/lib/api-client.ts` em funções (`api.get/page/post/patch/put/delete/blobUrl/download`), com o mesmo comportamento do Vue e `signal` opcional em todas; `parsed(schema)` para validar a resposta com o contrato. `shared/lib/api-error.ts` copiado, mais `applyFieldErrors(error, setError)` para o React Hook Form. `shared/lib/auth-client.ts` com `better-auth/react` + `magicLinkClient`. `busy.ts` não foi portado (o indicador vem do `useIsMutating()` no M2.1).
- **Decisões:**
  - Assinatura nova `api.get(url, { params, signal })` em vez de `api.get(url, params)`: o `signal` do `queryFn` entra em todas as chamadas sem um terceiro argumento posicional.
  - O único estado de módulo é o handler de sessão expirada.
  - Lint: specs (`*.spec.{ts,tsx}`) viraram a categoria `test` do boundaries e podem importar `src/testing` de qualquer camada; código de produção continua proibido (conferido com um arquivo temporário em `features/`).
- **Testes:** `api-error.spec.ts` (todos os casos do `check-api-error.ts`, mais `applyFieldErrors`, `apiErrorCode`, `isNotFound` e `failureKind`) e `api-client.spec.ts` (401 em `/auth/me` e `/my/profile` → `null` sem expirar a sessão; 401 em `/periods` → expira e lança; envelope e limpeza de parâmetros; paginação; corpo de erro na `ApiError`; `EMPTY_DOWNLOAD`; `AbortSignal`; `parsed`). 24 testes no pacote.
- **Ficou de fora:** nada.
- **Tempo:** ~30 min.

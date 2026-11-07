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
- **Branch:** `feat/COM-315-bootstrap-web-react` (a partir de `feat/COM-314-baseline-vue`)
- **O que foi feito:** pacote `web-react` (React 19.3, React Router 7.18, TanStack Query 5.106, Vite 7.3, `@vitejs/plugin-react` 5.2 com `babel-plugin-react-compiler` 1.0, Tailwind 4, `vite-plugin-pwa` 1.3). `vite.config.ts`, `index.html` e `public/` copiados do `apps/web`; no Vite a única mudança é o plugin. `src/shared/config/env.ts` valida `VITE_API_URL`/`VITE_AUTH_URL` com zod no boot. Raiz: `dev:react` (contracts em watch + API + web-react na 5174). `docs/react-standards.md` com o Anexo A integral, linkado no `AGENTS.md`.
- **Decisões:**
  - `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess` ficaram ligados: um arquivo temporário importando todo o `@competa/contracts` passou no `tsc -b`.
  - A porta 5174 vem do script `dev` (`vite --port 5174 --strictPort`), não do `vite.config.ts`, para manter a regra "a única mudança no Vite é o plugin".
  - O `index.html` monta em `#root` (era `#app`) e carrega `/src/main.tsx`; metas, ícones e manifest iguais.
  - `vite-plugin-pwa` subiu de 0.20 para 1.3 (a 0.20 não declara suporte ao Vite 7). A config é a mesma.
- **Evidência do React Compiler:** componente filho com `console.log` no render, pai com contador. No dev server: 2 renders na montagem (StrictMode) e 0 depois de 3 cliques no pai.
- **Ficou de fora:** `lint`, `test`, `check:no-diamond` e `check:wcag` entram no M0.3/M0.4, como o ticket diz.
- **Tempo:** ~40 min.

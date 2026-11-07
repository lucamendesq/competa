# Diário da migração Vue → React (`apps/web` → `apps/web-react`)

Um bloco por ticket, na ordem em que foram executados. Plano: [`docs/react-migration-2026-11.md`](../react-migration-2026-11.md). Issues: label `migration-react` no Linear (épico raiz COM-295).

## Decisões de execução que valem para a fila inteira

- **Base da cadeia é `origin/main`, não `staging`.** Em 2026-11-07 o `origin/staging` (`4380d12`) está 19 commits atrás do `main` e não tem nada próprio. O PR #19 (os achados de QA do Vue, inclusive `/mensagens`, que o plano usou como especificação) foi mergeado no `main`. Partir do `staging` daria um Vue desatualizado como especificação. Os PRs apontam para `staging`, como o Prompt B pede; até o `staging` ser atualizado com o `main`, o primeiro PR da cadeia mostra também esses 19 commits.
- **Sem permissão de merge.** O prompt não a concedeu, então os PRs são encadeados: cada branch nasce da anterior. A cadeia está registrada abaixo, ticket a ticket.
- **Linear não tem o estado "Blocked"** no time COM. Ticket parado por humano fica em **Todo** com o comentário "aguardando humano: …" e o checklist.
- **Worktree próprio** (`../competa-react`), para não mexer nos arquivos staged da branch `fix/qa-staging-findings` do checkout principal.

## Cadeia de PRs

| Ticket       | Branch                      | Base      | PR          |
| ------------ | --------------------------- | --------- | ----------- |
| M0.1 COM-314 | `feat/COM-314-baseline-vue` | `staging` | (ver bloco) |

---

## M0.1 · COM-314 · Baseline visual do app Vue

- **Data:** 2026-11-07
- **Branch:** `feat/COM-314-baseline-vue` (a partir de `origin/main` `1d982b7`)
- **O que foi feito:** o agente rodou o Prompt C localmente (Docker com `api-db-1`, banco `competa_baseline`, API em `development` na porta 3100, Vue em 5173). `docs/qa/baseline-vue-2026-11/` tem 117 PNGs, o `capture.ts` (monta a cena pela API e captura com Playwright na mesma passada) e o `index.md` com a tabela imagem → rota → viewport → estado → o que observar.
- **Decisões:**
  - `playwright@1.48.2` entrou como devDependency da raiz: o M10.2 roda o mesmo script contra o React. O script aceita `CHROMIUM_PATH` para usar o Chrome do sistema.
  - A única linha gravada direto no banco é uma mensagem marcada como `failed`, porque em `development` nenhum canal falha. Está registrada no `index.md`.
  - O "relatório" da importação é o estado em que o Vue volta para `/empresas` depois de confirmar: é o que a tela faz hoje.
- **Ficou de fora:** `/minha-area/pendencias` vazio (o Responsável da cena tem pendências); `/mensagens` página 2 (só 6 mensagens). As imagens foram **linkadas** no épico (a pasta no PR), não anexadas como zip: são 33 MB e já moram no repositório.
- **Tempo:** ~1h30 (a maior parte ajustando as interações de 8 estados).

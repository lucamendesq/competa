# Roadmap v1 — Linha de construção (fatias finas, esqueleto ambulante)

> **Objetivo: você nunca vê o monstro inteiro.** Cada tarefa é uma fatia vertical fina (poucas horas a 1 dia), entrega **algo visível/testável rodando**, e o schema do banco **cresce tabela-a-tabela** conforme a feature precisa — você NÃO constrói as 14 tabelas de uma vez.

Regras de leitura:
1. **Faça na ordem.** Cada tarefa só depende da anterior necessária (coluna "Depende").
2. **Uma tabela por vez.** A coluna "Tabelas novas" diz o que entra no banco. Divergência entre migration e [`database-schema.md`](./database-schema.md) (canônico) é bug — corrija um dos dois na mesma PR.
3. **Sempre demonstrável.** A coluna "Demonstrável depois desta" é o que você consegue mostrar rodando localmente. Se não dá pra demonstrar, a fatia está grande demais — quebre mais. (Deploy e CI ficaram **fora do roadmap v1**, por decisão de 2026-09-02: o produto roda local até haver o que colocar no ar.)
4. Stack canônica: **Angular SPA (CSR) + NestJS + pnpm workspaces + `libs/contracts` (zod) + Drizzle/Postgres + Better Auth + R2** (ver [`decisions.md`](./decisions.md)).

## Fase 0 — Esqueleto ambulante

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| ✅ TASK-001 | pnpm workspaces + apps vazios (Angular SPA + Nest) + `libs/contracts` | — | — | web e api sobem localmente; `pnpm -r build` limpo |
| ✅ TASK-002 | Postgres + Drizzle + schema inicial | 001 | `accounting_firm` | `drizzle-push` roda em banco vazio; API conecta no boot |

## Fase 1 — Auth & tenant (a espinha)

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| ✅ TASK-003 | Better Auth montado na API + CORS/cookies entre origens | 002 | `user`, `session`, `account`, `verification` (Better Auth) | `/api/auth/*` responde; cookie cross-origin `app.`↔`api.` funciona |
| ✅ TASK-004 | Provisionamento por script + signup por convite (spec D-02) | 003 | `accountant` | criar conta cria os 3 registros numa transação; sessão iniciada |
| ✅ TASK-005 | Login + AuthGuard/TenantGuard + `FirmScope` + shell do painel | 004 | — | logar entra num painel vazio protegido; `/me` escopado; repositórios exigem `FirmScope` |

## Fase 2 — Cadastro (registry): catálogo, templates, empresas

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-006 | `document_type` + seed mínimo + `GET /document-types` | 005 | `document_type` | catálogo mínimo consultável |
| TASK-007 | `checklist_template` (+item) + seed de 1 template fixo (MEI) | 006 | `checklist_template`, `checklist_template_item` | 1 template fixo listável (destrava criar Empresa) |
| TASK-008 | `company` + criar/listar Empresa (referencia template) | 007 | `company` | cadastrar e ver 1 Empresa no painel, escopada por tenant |
| TASK-009 | `contact` + Responsável na Empresa (email obrigatório) | 008 | `contact` | Empresa com Responsável; sem email → bloqueado |
| TASK-010 | Editar Empresa + flags (jsonb) + desativar (soft delete) | 009 | — | editar dados/flags e desativar Empresa |
| TASK-011 | Importar planilha (CSV/XLSX) com relatório por linha | 010 | — | importar carteira inteira de uma vez |
| TASK-012 | Seed completo: catálogo inteiro + 5 templates fixos (idempotente) | 007 | — | catálogo e os 5 templates do produto completos |
| TASK-013 | Derivar template próprio + editar itens do derivado | 012 | — | template do tenant editável (`derived_from`) |
| TASK-014 | `company_checklist_override` (add/remove por Empresa) | 013, 009 | `company_checklist_override` | edição leve do checklist por Empresa |
| TASK-015 | `getEffectiveChecklist(companyId)` — consulta canônica única | 014 | — | checklist efetivo (template − remove + add) num único ponto; prévia na tela da Empresa |

## Fase 3 — Coleta CORE: abrir a Competência

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-016 | `period` + abrir Competência vazia (só cria o period, unicidade) | 005 | `period` | abrir a competência 1x por Contabilidade; tela "abrir competência" |
| TASK-017 | `request` + fan-out (1 Solicitação por Empresa ativa c/ email) | 016, 009 | `request` | abrir gera N Solicitações; Empresas sem email listadas como aviso |
| TASK-018 | `request_item` + snapshot congelado + filtros de periodicidade/flag | 017, 015 | `request_item` | cada Solicitação com itens copiados do checklist efetivo |
| TASK-019 | `due_date` por item (congelado) + fallback `period.due_date` | 018 | — | prazos por item calculados na abertura |
| TASK-020 | `upload_link` + geração de token (hash) por Solicitação | 017 | `upload_link` | cada Solicitação nasce com um Link de Upload (token só como hash) |

## Fase 4 — Upload público (o diferencial "sem senha")

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-021 | `UploadTokenGuard` + página pública mostrando o checklist (só-upload) | 020, 018 | — | abrir o link (sem senha) mostra itens/status/prazos; expirado → erro genérico |
| TASK-022 | `document` + upload de 1 arquivo direto ao R2 (URL pré-assinada) | 021 | `document` | enviar 1 arquivo a 1 item; item vira `submitted` |
| TASK-023 | Multi-arquivo + zip sem extração + recusa por formato/limites | 022 | — | N arquivos e zip; validação de formato e limites (100 MB / 500) |
| TASK-024 | Documento Extra + bloqueio de itens quando Solicitação encerrada | 022 | — | enviar Extra a qualquer momento; itens bloqueiam ao encerrar |

## Fase 5 — Comunicação (messaging): email fecha o loop de cobrança

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-025 | Interface de provider + email (Resend/SES) + `message`; envia link na abertura | 020, 017 | `message` | ao abrir competência, Responsável recebe o link por email; envio logado |
| TASK-026 | Cron de lembretes agrupados (máx. 2; com/sem prazo) | 025, 018 | — | lembretes automáticos de pendência por Solicitação |

## Fase 6 — Coleta: revisão, pendências, encerramento

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-027 | Revisão em lote por Item (aceitar Item / rejeitar Documento) | 022 | — | revisar no painel; aceitar Item aceita todos os docs; rejeição reabre Item |
| TASK-028 | Reenvio de Link SÓ por email na reabertura do Item | 027, 025 | — | rejeitar dispara novo link por email |
| TASK-029 | `request` → `complete` automático (todos os itens aceitos) | 027 | — | Solicitação se marca completa sozinha |
| TASK-030 | Painel de Pendências "quem faltou" + `MessageFailed` visível | 027, 025 | — | painel mostra por Empresa o que falta; canal quebrado aparece |
| TASK-031 | Encerrar Solicitação / Competência (pode com pendências) | 029 | — | Contador encerra (palavra final, com aviso) |
| TASK-032 | `DeadlineMissed` por item (cron) → notifica Responsável + Contador | 019, 026 | — | estouro de prazo avisa os dois lados |

## Fase 7 — Entrega: zip

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-033 | Zip por Empresa/Competência (streaming do R2) | 022 | — | baixar tudo de uma Empresa/competência num zip |
| TASK-034 | Zip da Competência inteira (todas as Empresas) 🟡 | 033 | — | baixar a competência inteira de uma vez |

## Fase 8 — WhatsApp

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-035 | Canal WhatsApp (Cloud API) + webhook de status; degrada p/ email | 025 | — | link/lembretes por WhatsApp quando há telefone |

## Fase 9 — Mobile (decisão + app)

| Task | Título | Depende | Tabelas novas | Demonstrável depois desta |
|------|--------|---------|---------------|---------------------------|
| TASK-036 | Decisão RN vs Flutter (spike curto) + registro da decisão | 025, 027 | — | decisão de framework mobile registrada em [`decisions.md`](./decisions.md) |
| TASK-037 | App do Responsável (upload autenticado + push FCM) | 036 | — | app com upload + notificações push |

## Marcos de validação (dopamina + negócio)

- **Após TASK-005:** você loga num painel de verdade. (fim da fundação)
- **Após TASK-011:** um contador real já consegue subir a carteira dele. (registry utilizável)
- **Após TASK-024:** o fluxo central existe ponta-a-ponta — abrir competência → link sem senha → Responsável sobe arquivo. **É aqui que dá pra rodar o concierge do discovery.**
- **Após TASK-034:** a jornada da ideia original está 100% coberta em web (cobra → recebe → revisa → pendências → zip).
- **Após TASK-035:** WhatsApp-first (critério de troca citado pelos contadores).

> Validação de negócio (discovery) roda em paralelo: landing com preço + concierge de 1 mês. As hipóteses 🔴 (pagam por ferramenta avulsa? link sem senha aumenta entrega?) seguem abertas — priorize chegar na TASK-024 antes de construir as fases 6–9. Ver [`product.md`](./product.md#hipóteses-mais-arriscadas-validar-antes-do-produto-completo).

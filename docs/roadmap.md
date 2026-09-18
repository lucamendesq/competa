# Roadmap v1 — Linha de construção (fatias finas, esqueleto ambulante)

> **Objetivo: você nunca vê o monstro inteiro.** Cada tarefa é uma fatia vertical fina (poucas horas a 1 dia), entrega **algo visível/testável rodando**, e o schema do banco **cresce tabela-a-tabela** conforme a feature precisa — você NÃO constrói as 14 tabelas de uma vez.

Regras de leitura:

1. **Faça na ordem.** Cada tarefa só depende da anterior necessária (coluna "Depende").
2. **Uma tabela por vez.** A coluna "Tabelas novas" diz o que entra no banco. Divergência entre migration e [`database-schema.md`](./database-schema.md) (canônico) é bug — corrija um dos dois na mesma PR.

> **Tudo o que falta agora tem número:** WhatsApp (Fase 8), mobile (Fase 9), cobrança
> (Fase 13, TASK-047..050) e LGPD operacional (Fase 14, TASK-051..055). Deploy/CI, backup e
> a base de LGPD (termos/privacidade, aceite, retenção) **existem desde 2026-09-11** — ver
> `deploy.md`, `backup.md` e `retention.md`. O detalhe narrativo continua em
> [`next-steps.md`](./next-steps.md).

3. **Sempre demonstrável.** A coluna "Demonstrável depois desta" é o que você consegue mostrar rodando localmente. Se não dá pra demonstrar, a fatia está grande demais — quebre mais. (Deploy e CI ficaram fora do roadmap v1 por decisão de 2026-09-02, **revertida em 2026-09-11**: Dockerfile, `fly.toml` com migrations no release, CI e deploy pós-CI existem — ver [`deploy.md`](./deploy.md) e `next-steps.md` §3.)
4. Stack canônica: **Angular SPA (CSR) + NestJS + pnpm workspaces + `libs/contracts` (zod) + Drizzle/Postgres + Better Auth + R2** (ver [`decisions.md`](./decisions.md)).

> **Frontend (2026-09-07): as telas do Angular existem.** As 21 páginas das Fases 1–7 e da
> Fase 10 foram implementadas em `apps/web` e verificadas no navegador contra a API real
> (convite → login → cadastro de Empresa → abrir competência → link sem senha → upload →
> revisão/rejeição → zip → área do Responsável). O "no painel" das colunas abaixo passa a
> ser demonstrável pela tela, não só por HTTP. Lacunas conhecidas e telas degradadas estão
> em [`docs/frontend-status.md`](./frontend-status.md).

## Fase 0 — Esqueleto ambulante

| Task        | Título                                                                | Depende | Tabelas novas     | Demonstrável depois desta                               |
| ----------- | --------------------------------------------------------------------- | ------- | ----------------- | ------------------------------------------------------- |
| ✅ TASK-001 | pnpm workspaces + apps vazios (Angular SPA + Nest) + `libs/contracts` | —       | —                 | web e api sobem localmente; `pnpm -r build` limpo       |
| ✅ TASK-002 | Postgres + Drizzle + schema inicial                                   | 001     | `accounting_firm` | `drizzle-push` roda em banco vazio; API conecta no boot |

## Fase 1 — Auth & tenant (a espinha)

| Task        | Título                                                        | Depende | Tabelas novas                                              | Demonstrável depois desta                                                               |
| ----------- | ------------------------------------------------------------- | ------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ✅ TASK-003 | Better Auth montado na API + CORS/cookies entre origens       | 002     | `user`, `session`, `account`, `verification` (Better Auth) | `/api/auth/*` responde; cookie cross-origin `app.`↔`api.` funciona                      |
| ✅ TASK-004 | Provisionamento por script + signup por convite (spec D-02)   | 003     | `accountant`                                               | criar conta cria os 3 registros numa transação; sessão iniciada                         |
| ✅ TASK-005 | Login + AuthGuard/TenantGuard + `FirmScope` + shell do painel | 004     | —                                                          | logar entra num painel vazio protegido; `/me` escopado; repositórios exigem `FirmScope` |

## Fase 2 — Cadastro (registry): catálogo, templates, empresas

> **Estado (2026-09-03): backend das fatias 006–015 entregue e verificado por HTTP.**
> As telas Angular do painel (incluindo o shell que a TASK-005 não entregou) ficaram
> para uma fatia própria de frontend — o "no painel" das colunas abaixo hoje é
> demonstrável pela API. Ver o log de execução da fase.

| Task        | Título                                                            | Depende  | Tabelas novas                                   | Demonstrável depois desta                                                              |
| ----------- | ----------------------------------------------------------------- | -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| ✅ TASK-006 | `document_type` + seed mínimo + `GET /document-types`             | 005      | `document_type`                                 | catálogo mínimo consultável                                                            |
| ✅ TASK-007 | `checklist_template` (+item) + seed de 1 template fixo (MEI)      | 006      | `checklist_template`, `checklist_template_item` | 1 template fixo listável (destrava criar Empresa)                                      |
| ✅ TASK-008 | `company` + criar/listar Empresa (referencia template)            | 007      | `company`                                       | cadastrar e ver 1 Empresa no painel, escopada por tenant                               |
| ✅ TASK-009 | `contact` + Responsável na Empresa (email obrigatório)            | 008      | `contact`                                       | Empresa com Responsável; sem email → bloqueado                                         |
| ✅ TASK-010 | Editar Empresa + flags (jsonb) + desativar (soft delete)          | 009      | —                                               | editar dados/flags e desativar Empresa                                                 |
| ✅ TASK-011 | Importar planilha (CSV/XLSX) com relatório por linha              | 010      | —                                               | importar carteira inteira de uma vez                                                   |
| ✅ TASK-012 | Seed completo: catálogo inteiro + 5 templates fixos (idempotente) | 007      | —                                               | catálogo e os 5 templates do produto completos                                         |
| ✅ TASK-013 | Derivar template próprio + editar itens do derivado               | 012      | —                                               | template do tenant editável (`derived_from`)                                           |
| ✅ TASK-014 | `company_checklist_override` (add/remove por Empresa)             | 013, 009 | `company_checklist_override`                    | edição leve do checklist por Empresa                                                   |
| ✅ TASK-015 | `getEffectiveChecklist(companyId)` — consulta canônica única      | 014      | —                                               | checklist efetivo (template − remove + add) num único ponto; prévia na tela da Empresa |

## Fase 3 — Coleta CORE: abrir a Competência

> **Estado (2026-09-04): entregue e verificado por HTTP.** `POST /periods` faz o fan-out
> completo (Solicitação + snapshot dos Itens + prazo congelado + Link de Upload) numa
> transação; decisão do fan-out isolada em `modules/periods/fan-out.ts` (pura, testada).

| Task        | Título                                                              | Depende  | Tabelas novas  | Demonstrável depois desta                                          |
| ----------- | ------------------------------------------------------------------- | -------- | -------------- | ------------------------------------------------------------------ |
| ✅ TASK-016 | `period` + abrir Competência vazia (só cria o period, unicidade)    | 005      | `period`       | abrir a competência 1x por Contabilidade; tela "abrir competência" |
| ✅ TASK-017 | `request` + fan-out (1 Solicitação por Empresa ativa c/ email)      | 016, 009 | `request`      | abrir gera N Solicitações; Empresas sem email listadas como aviso  |
| ✅ TASK-018 | `request_item` + snapshot congelado + filtros de periodicidade/flag | 017, 015 | `request_item` | cada Solicitação com itens copiados do checklist efetivo           |
| ✅ TASK-019 | `due_date` por item (congelado) + fallback `period.due_date`        | 018      | —              | prazos por item calculados na abertura                             |
| ✅ TASK-020 | `upload_link` + geração de token (hash) por Solicitação             | 017      | `upload_link`  | cada Solicitação nasce com um Link de Upload (token só como hash)  |

## Fase 4 — Upload público (o diferencial "sem senha")

> **Estado (2026-09-07): entregue ponta-a-ponta, com tela.** O backend saiu em 2026-09-04
> (ver D12 para storage); a página pública `/envio/:token` entrou em 2026-09-07 e foi
> verificada no navegador: presign → `PUT` no storage → confirmação, com recusa por formato
> em PT-BR e motivo da rejeição visível para o Responsável.

| Task        | Título                                                                | Depende  | Tabelas novas | Demonstrável depois desta                                                     |
| ----------- | --------------------------------------------------------------------- | -------- | ------------- | ----------------------------------------------------------------------------- |
| ✅ TASK-021 | `UploadTokenGuard` + página pública mostrando o checklist (só-upload) | 020, 018 | —             | abrir o link (sem senha) mostra itens/status/prazos; expirado → erro genérico |
| ✅ TASK-022 | `document` + upload de 1 arquivo direto ao R2 (URL pré-assinada)      | 021      | `document`    | enviar 1 arquivo a 1 item; item vira `submitted`                              |
| ✅ TASK-023 | Multi-arquivo + zip sem extração + recusa por formato/limites         | 022      | —             | N arquivos e zip; validação de formato e limites (100 MB / 500)               |
| ✅ TASK-024 | Documento Extra + bloqueio de itens quando Solicitação encerrada      | 022      | —             | enviar Extra a qualquer momento; itens bloqueiam ao encerrar                  |

## Fase 5 — Comunicação (messaging): email fecha o loop de cobrança

> **Estado (2026-09-04): entregue e verificado por HTTP.** `MessageProvider` com `ResendEmail`
> e `LogEmail` (sem `RESEND_API_KEY`, cai no log de dev — mesmo padrão do D12); todo envio
> vira linha em `message`; canal quebrado **nunca** bloqueia o fluxo (`status='failed'` +
> `error`). Lembretes com decisão pura e testada em `modules/messaging/reminder-rules.ts`.
> **Não verificado:** envio real pela Resend (sem chave/domínio).

| Task        | Título                                                                         | Depende  | Tabelas novas | Demonstrável depois desta                                               |
| ----------- | ------------------------------------------------------------------------------ | -------- | ------------- | ----------------------------------------------------------------------- |
| ✅ TASK-025 | Interface de provider + email (Resend/SES) + `message`; envia link na abertura | 020, 017 | `message`     | ao abrir competência, Responsável recebe o link por email; envio logado |
| ✅ TASK-026 | Cron de lembretes agrupados (máx. 2; com/sem prazo)                            | 025, 018 | —             | lembretes automáticos de pendência por Solicitação                      |

## Fase 6 — Coleta: revisão, pendências, encerramento

> **Estado (2026-09-04): entregue e verificado por HTTP**, incluindo o loop completo
> abertura → email → upload público → rejeição no painel → token rotacionado → reenvio por
> email. Transições de estado e "quem faltou" em `modules/requests/review-rules.ts` (puro,
> testado).

| Task        | Título                                                             | Depende  | Tabelas novas | Demonstrável depois desta                                                  |
| ----------- | ------------------------------------------------------------------ | -------- | ------------- | -------------------------------------------------------------------------- |
| ✅ TASK-027 | Revisão em lote por Item (aceitar Item / rejeitar Documento)       | 022      | —             | revisar no painel; aceitar Item aceita todos os docs; rejeição reabre Item |
| ✅ TASK-028 | Reenvio de Link SÓ por email na reabertura do Item                 | 027, 025 | —             | rejeitar dispara novo link por email                                       |
| ✅ TASK-029 | `request` → `complete` automático (todos os itens aceitos)         | 027      | —             | Solicitação se marca completa sozinha                                      |
| ✅ TASK-030 | Painel de Pendências "quem faltou" + `MessageFailed` visível       | 027, 025 | —             | painel mostra por Empresa o que falta; canal quebrado aparece              |
| ✅ TASK-031 | Encerrar Solicitação / Competência (pode com pendências)           | 029      | —             | Contador encerra (palavra final, com aviso)                                |
| ✅ TASK-032 | `DeadlineMissed` por item (cron) → notifica Responsável + Contador | 019, 026 | —             | estouro de prazo avisa os dois lados                                       |

## Fase 7 — Entrega: zip

> **Estado (2026-09-04): entregue e verificado por HTTP.** `GET /requests/:id/zip` e
> `GET /periods/:id/zip`, streaming de ponta a ponta (`StorageProvider.openRead` → archiver →
> resposta; nada em memória nem em disco intermediário). Zip sem recompressão (`store`): os
> documentos já chegam comprimidos e o egress do R2 é grátis. Documento **rejeitado não entra
> na entrega**; Documento Extra vai em pasta própria; nome repetido no mesmo Item ganha
> sufixo. Nomes/colisões em `modules/requests/zip.ts` (puro, testado).

| Task        | Título                                         | Depende | Tabelas novas | Demonstrável depois desta                      |
| ----------- | ---------------------------------------------- | ------- | ------------- | ---------------------------------------------- |
| ✅ TASK-033 | Zip por Empresa/Competência (streaming do R2)  | 022     | —             | baixar tudo de uma Empresa/competência num zip |
| ✅ TASK-034 | Zip da Competência inteira (todas as Empresas) | 033     | —             | baixar a competência inteira de uma vez        |

## Fase 8 — WhatsApp

| Task     | Título                                                           | Depende | Tabelas novas | Demonstrável depois desta                      |
| -------- | ---------------------------------------------------------------- | ------- | ------------- | ---------------------------------------------- |
| TASK-035 | Canal WhatsApp (Cloud API) + webhook de status; degrada p/ email | 025     | —             | link/lembretes por WhatsApp quando há telefone |

## Fase 9 — Mobile (decisão + app)

| Task     | Título                                                    | Depende  | Tabelas novas | Demonstrável depois desta                                                  |
| -------- | --------------------------------------------------------- | -------- | ------------- | -------------------------------------------------------------------------- |
| TASK-036 | Decisão RN vs Flutter (spike curto) + registro da decisão | 025, 027 | —             | decisão de framework mobile registrada em [`decisions.md`](./decisions.md) |
| TASK-037 | App do Responsável (upload autenticado + push FCM)        | 036      | —             | app com upload + notificações push                                         |

## Fase 10 — Experiência do Responsável (PWA + passkey)

> Aprovada em 2026-09-04 (spec de design detalhada era doc de processo; removida na
> limpeza de 2026-09-12 — o que vale está nesta tabela e no código).
> Login sem senha: **passkey/biometria** com **magic link** como plano B; conta criada em
> auto-serviço a partir do Link de Upload; visibilidade **por Empresa** com histórico de quem
> enviou. A PWA (F10-6) foi entregue em 2026-09-07 junto com as telas.
>
> **Estado (2026-09-04): backend entregue e verificado por HTTP.** Rotas: `POST /upload/:token/account`
> (cria acesso pela credencial que já circula) · `/api/auth/sign-in/magic-link` + `/api/auth/passkey/*`
> (plugins do Better Auth) · `GET /my/profile|pending|periods|periods/:id` · `POST /my/documents`
>
> - `/confirm` (envio logado, mesmo pipeline da Fase 4 com outro guard) · `POST|DELETE /my/push/subscribe`
>   · `GET /companies/:id/contacts/access` e `DELETE .../:contactId/access` (revogação).
>   **Não verificado:** passkey de ponta a ponta (exige aparelho/navegador com WebAuthn) e push
>   real (exige chaves VAPID) — os dois caem em fallback de log em dev, como o R2 e a Resend.

| Task     | Título                                                                                        | Depende    | Tabelas novas                           | Demonstrável depois desta                                                                  |
| -------- | --------------------------------------------------------------------------------------------- | ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| ✅ F10-1 | Magic link + criar acesso pelo Link de Upload + `ContactScope`/`ContactGuard` + `/me/contact` | 022        | `push_subscription`, `passkey` (plugin) | Responsável cria conta pelo link e vê quem ele é                                           |
| ✅ F10-2 | Passkey: registro e login                                                                     | ✅ F10-1   | —                                       | entra por biometria; reinstalar não pede email                                             |
| ✅ F10-3 | Leitura: `/my/pending`, `/my/periods`, `/my/periods/:id` com autoria                          | F10-1, 027 | —                                       | ele vê o que falta, o que mandou, o que foi rejeitado e por quê                            |
| ✅ F10-4 | Upload logado (`ContactScope`, sem link)                                                      | ✅ F10-3   | —                                       | envia sem depender do email                                                                |
| ✅ F10-5 | Web Push nos eventos existentes                                                               | F10-1, 025 | —                                       | push de novo pedido, rejeição e prazo                                                      |
| ✅ F10-6 | PWA Angular (área do Responsável instalável)                                                  | ✅ F10-4   | —                                       | manifest + service worker; casca abre offline; push depende de `VAPID_PUBLIC_KEY` no front |
| ✅ F10-7 | Revogação de acesso pelo Contador                                                             | ✅ F10-1   | —                                       | Contador corta o acesso de um Responsável                                                  |

## Fase 11 — Segurança (achados do audit `run-20260911`) — ✅ concluída em 2026-09-11

> Origem: audit de segurança `run-20260911` (11 agentes especializados + verificação
> manual, 27 achados). Ordem = plano de remediação do próprio relatório (exploitabilidade ×
> impacto ÷ esforço). O diretório `.security-audit/` foi removido na limpeza de 2026-09-12,
> depois de toda a remediação — a disposição final de cada achado está no bloco abaixo e o
> fix de cada um, no código/testes das TASKs.
>
> **Disposição dos 27 achados:** 19 corrigidos (TASK-038..046). **Aceitos sem mudança**
> (Info/teóricos, inertes hoje): AUTHZ-6 (helpers de
> repositório sem escopo — disciplina do caller, coberta pelos guards), AUTHN-3 (TOCTOU do
> convite — bloqueado pela unicidade de email), AVAIL-4 (`files` sem `.max()` no zod — o
> service corta em 500 e o body limit em 2MB), INJ-1 (senderName no header — só alcançável
> via CLI), INJ-2/SUPPLY-4 (script dev-only), INJ-3 (falso positivo do semgrep).
> **Operacional:** HTTP-1 (CNAME dangling) — nota no `deploy.md`.
>
> **Pendência operacional da TASK-040:** cadastrar `DB_SSL_CA` (CA da Supabase) como Fly
> secret ANTES do próximo deploy — com `rejectUnauthorized: true`, o boot de produção falha
> sem ela.

| Task        | Título                                                                                                                                                                   | Severidade    | Achado(s)                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------- |
| ✅ TASK-038 | Recusar ativação passwordless (`POST /upload/:token/access`) quando o email já pertence a um usuário existente                                                           | Crítico       | AUTHZ-1                                                     |
| ✅ TASK-039 | Remover `sameSite:'none'` (cookie `.competa.com.br` sob `Lax`) + Origin-check nas rotas mutantes                                                                         | Crítico       | CSRF-1 / AUTHN-2                                            |
| ✅ TASK-040 | `sslmode=verify-full` + CA bundle da Supabase na conexão de produção (API e `drizzle.config.ts`)                                                                         | Alto          | SEC-1                                                       |
| ✅ TASK-041 | `advanced.ipAddress.trustedProxies`/`ipAddressHeaders` no Better Auth (rate limiter não pode colapsar num bucket global)                                                 | Alto          | AUTHN-1                                                     |
| ✅ TASK-042 | Escopar `POST /messages/reminders/run` por `firmScope` (ou remover a rota manual, deixar só o cron)                                                                      | Médio         | AUTHZ-2                                                     |
| ✅ TASK-043 | Log de negação de guard (Logger + Sentry) + colunas de autoria em `document`/`request_item`/`invite`                                                                     | Médio         | OPS-1                                                       |
| ✅ TASK-044 | Cap de concorrência no fan-out de HEAD do zip + limite de documentos/bytes por Solicitação/Competência                                                                   | Médio         | AVAIL-1, AVAIL-2                                            |
| ✅ TASK-045 | Parar de logar a URL do magic-link no fallback de boot; pinar `setup-flyctl`; override de `qs`                                                                           | Médio / Baixo | SEC-2, SUPPLY-1, SUPPLY-2                                   |
| ✅ TASK-046 | Itens Low/Info restantes (enumeração em `/access/recover`, push-subscription hijack, TOCTOU de review, R2 Content-Type, `multer` inalcançável, escape de `url` em email) | Baixo / Info  | AUTHZ-3..6, AVAIL-3/4, SSRF-1, SUPPLY-3, XSS-INFO-1, HTTP-1 |

## Fase 12 — Lacunas de produto e conta (lote de 2026-09-11) — ✅ concluída

> Fecharam de uma vez os itens 🟠/🟡 de `next-steps.md` §1–§2 (detalhe por item lá, marcado ✅):

| Entrega                                   | Resumo                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Push de "novo pedido"                  | `RequestCreated` também vira push (F10-5 completo)                                                                                                       |
| ✅ Ver documento no portal do Responsável | `GET /my/documents/:id/content` + preview/download em `/minha-area`                                                                                      |
| ✅ Multi-empresa                          | `contact.auth_user_id` sem UNIQUE; `ContactScope` multi-vínculo; ativação pelo Link vincula conta existente; revogação só apaga o user no último vínculo |
| ✅ Gestão de equipe                       | `GET/DELETE /accountants`, `GET/PATCH /accounting-firm`, listar/revogar convites + telas em /configuracoes                                               |
| ✅ Preferências de lembrete               | `accounting_firm.reminder_*` editáveis pelo dono na aba Lembretes                                                                                        |
| ✅ Import XLSX                            | conversão no browser (SheetJS, 1ª aba) + cabeçalhos PT aliased no servidor                                                                               |
| ✅ Reset de senha do Contador             | `sendResetPassword` (token 1h) + telas /esqueci-senha e /redefinir-senha                                                                                 |
| ✅ "Perdi meu link" em 2 passos           | email de confirmação de posse (HMAC 30min) antes de rotacionar                                                                                           |
| ✅ Termos/Privacidade + aceite            | páginas `/termos` e `/privacidade` + `user.terms_accepted_at` nos 3 fluxos de criação                                                                    |
| ✅ Backup + retenção                      | `backup.yml` (pg_dump diário → R2 dedicado) + `backup.md` + `retention.md`                                                                               |

## Fase 13 — Cobrança (SaaS de verdade)

> 🔴 O maior buraco para operar: zero código de cobrança. Preço hipotético e métrica
> (empresas ativas em competência aberta, tiers R$59–197) em
> [`product.md`](./product.md); validar contra o discovery antes da TASK-049.

| Task     | Título                                                                                     | Depende | Tabelas novas  | Demonstrável depois desta                                            |
| -------- | ------------------------------------------------------------------------------------------ | ------- | -------------- | -------------------------------------------------------------------- |
| TASK-047 | ADR: gateway (Stripe vs Pagar.me/Asaas — pix/boleto pesam) + modelo de plano/trial         | —       | —              | decisão registrada em `decisions.md` com preço e métrica de cobrança |
| TASK-048 | Schema de assinatura: `subscription` na `accounting_firm` (plano, status, trial, período)  | 047     | `subscription` | firm nova nasce em trial; `GET /accounting-firm` devolve o plano     |
| TASK-049 | Checkout + webhook do gateway (ativação, falha de pagamento, cancelamento)                 | 048     | —              | assinar de verdade em sandbox; status muda via webhook               |
| TASK-050 | Régua de inadimplência: aviso → bloqueio de escrita (leitura/export ficam) + tela de plano | 049     | —              | firm inadimplente vê banner e perde escrita; regularizou, voltou     |

## Fase 14 — LGPD operacional (o que restou do §5 do next-steps)

> Itens 1 e 3 (termos/privacidade + aceite, retenção/expurgo) já entregues em 2026-09-11.
> O que resta é majoritariamente documento e processo — barato, e é o que aparece na
> primeira venda para contabilidade com jurídico.

| Task     | Título                                                                                                                      | Depende | Tabelas novas | Demonstrável depois desta                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ------- | ------------- | -------------------------------------------------------------------------- |
| TASK-051 | Contrato de operador (DPA) padrão — anexo dos Termos, com suboperadores nomeados (R2/Supabase/Resend)                       | —       | —             | `docs/dpa.md` + link em `/termos`; pronto para anexar em proposta          |
| TASK-052 | Exportação e exclusão a pedido do titular (arts. 18 IV/VI): runbook manual + SQL, incluindo `contact` e `push_subscription` | —       | —             | `docs/retention.md` ganha a seção "pedido do titular" com prazo de 15 dias |
| TASK-053 | Registro das operações de tratamento (art. 37): inventário dado→finalidade→destino                                          | —       | —             | `docs/lgpd-registro.md` — tabela completa dos dados coletados              |
| TASK-054 | Plano de resposta a incidente (art. 48): quem avisa, em quanto tempo, com que texto                                         | —       | —             | `docs/incident-response.md` com runbook e modelos de comunicação           |
| TASK-055 | DPO nomeado + canal público de contato                                                                                      | 051     | —             | nome/email do encarregado publicado em `/privacidade`                      |

## Adiados com gatilho (decisão de 2026-09-11)

| Item                                           | Por quê adiado                                                                                                                          | Gatilho para reabrir                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtro por responsável no Painel de Pendências | Não existe atribuição empresa→contador no schema, e as firms alvo têm 1–2 contadores — o filtro não filtraria nada.                     | Primeira firm com 3+ contadores pedindo divisão de carteira. Modelo mínimo: `company.responsible_accountant_id` + select no form + chip no painel. |
| Domínio de email próprio por escritório        | Exige verificação DNS por firm na Resend + UI de onboarding + tratamento de domínio quebrado. O remetente já mostra o nome da firm.     | Plano white-label no pricing, deliverability ruim atribuída ao domínio compartilhado, ou 3+ firms pedindo.                                         |
| Job automático de expurgo (retenção)           | Não há firm cancelada ainda; expurgo automático sem caso real é onde se apaga dado errado. Política + runbook manual em `retention.md`. | Primeiro cancelamento de Contabilidade.                                                                                                            |

## Marcos de validação (dopamina + negócio)

- **Após TASK-005:** você loga num painel de verdade. (fim da fundação)
- **Após TASK-011:** um contador real já consegue subir a carteira dele. (registry utilizável)
- **Após TASK-024:** o fluxo central existe ponta-a-ponta — abrir competência → link sem senha → Responsável sobe arquivo. **É aqui que dá pra rodar o concierge do discovery.**
- **Após TASK-034:** a jornada da ideia original está 100% coberta em web (cobra → recebe → revisa → pendências → zip).
- **Após TASK-035:** WhatsApp-first (critério de troca citado pelos contadores).

> Validação de negócio (discovery) roda em paralelo: landing com preço + concierge de 1 mês. As hipóteses 🔴 (pagam por ferramenta avulsa? link sem senha aumenta entrega?) seguem abertas — priorize chegar na TASK-024 antes de construir as fases 6–9. Ver [`product.md`](./product.md#hipóteses-mais-arriscadas-validar-antes-do-produto-completo).

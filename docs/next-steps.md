# Próximos passos — o que falta para "completo"

> Estado (2026-09-14, revisado). Este documento é o inventário do que **ainda não existe**;
> linhas ~~riscadas~~ com ✅ foram entregues (a maioria no lote de 2026-09-11 — Fases 11 e 12
> do [`roadmap.md`](./roadmap.md)). O que segue aberto de verdade: **cobrança (Fase 13,
> TASK-047..050)**, **WhatsApp (Fase 8)**, mobile nativo (Fase 9), e a
> LGPD operacional restante (Fase 14, TASK-051..055).
>
> **2026-09-14:** observabilidade completa — log estruturado (`nestjs-pino`, JSON com `firmId`/`reqId`), Sentry verificado e corrigido (`tracePropagationTargets`), falhas de canal→Sentry com tags, monitores de cron (`@SentryCron`) para os dois jobs diários.
>
> **2026-09-11:** os achados do audit de segurança viraram a Fase 11 do roadmap e foram
> **todos resolvidos** (TASK-038..046 ✅), incluindo a trilha de auditoria
> (`document.reviewed_by`, `invite.created_by`, log de 403).

Legenda de peso: 🔴 impede cobrar/operar · 🟠 queima na primeira semana de uso real ·
🟡 melhora, mas dá para viver sem.

## 1. Lacunas de produto

| Falta                                          | Peso | Detalhe                                                                                                                                                                  |
| ---------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cobrança / assinatura**                      | 🔴   | Não existe uma linha de código. Agora numerado: **Fase 13 do roadmap (TASK-047..050)** — ADR de gateway, schema de assinatura, checkout+webhook, régua de inadimplência. |
| **Fase 8 — WhatsApp** (TASK-035)               | 🔴   | Citado pelos contadores no discovery como critério de troca. A tela de canais mostra "não conectado" e degrada para email.                                               |
| ~~Push de "novo pedido"~~                      | ✅   | 2026-09-11: `CollectionEventsListener.onRequestCreated` manda push de novo pedido (F10-5 completo).                                                                      |
| ~~Baixar/ver Documento avulso~~                | ✅   | 2026-09-11: `GET /my/documents/:id/content` + preview/download na área do Responsável; o Painel de Pendências linka para a tela de revisão.                              |
| ~~Gestão de equipe~~                           | ✅   | 2026-09-11: `GET/DELETE /accountants`, `GET/PATCH /accounting-firm`, `GET/DELETE /invites`, telas em /configuracoes; reset de senha (§2) também.                         |
| ~~Um Responsável, várias Empresas~~            | ✅   | 2026-09-11: UNIQUE removido; `ContactScope` multi-vínculo, /my/* agregam por Empresa, revogação só apaga o user no último vínculo.                                       |
| ~~Preferências de lembrete por Contabilidade~~ | ✅   | 2026-09-11: `accounting_firm.reminder_*` (máx, D-N, gap) configuráveis na aba Lembretes; canal e hora do cron seguem fixos.                                              |
| ~~Import XLSX~~                                | ✅   | 2026-09-11: .xlsx convertido no browser (SheetJS, 1ª aba) e cabeçalhos em português aliased no servidor; a API continua recebendo só CSV.                                |
| **Fase 9 — mobile nativo** (TASK-036/037)      | 🟡   | A PWA cobre o caso por ora (instalável, push, upload).                                                                                                                   |
| **Filtros avançados no Painel de Pendências**  | 🟡   | Atraso já existe (chip). Filtro por Contador ADIADO (sem atribuição empresa→contador no modelo) — gatilho no roadmap, seção "Adiados".                                   |
| **Domínio de e-mail próprio por escritório**   | 🟡   | ADIADO (2026-09-11) — exige verificação DNS por firm na Resend + onboarding; gatilhos na seção "Adiados" do roadmap.                                                     |
| **Assinatura digital / protocolo de entrega**  | 🟡   | Nice-to-have para coleta, mas pode virar deal-breaker se o produto for vendido para entrega formal de documentos. Não construir sem demanda validada.                    |

## 2. Autenticação e conta

| Falta                                            | Peso | Detalhe                                                                                                                                    |
| ------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~Reset de senha do Contador~~                   | ✅   | 2026-09-11: `sendResetPassword` configurado (token 1h, sessões revogadas), telas /esqueci-senha e /redefinir-senha, link no login.         |
| ~~Confirmar posse do email no "perdi meu link"~~ | ✅   | 2026-09-11: fluxo em 2 passos — email de confirmação (token HMAC, 30min) antes de rotacionar; cooldown de 15min preservado (e consertado). |

## 3. Deploy, CI e infraestrutura

**Atualizado 2026-09-11 — o grosso existe** (a decisão de 2026-09-02 de deixar fora do v1
foi revertida em 2026-09-11; as versões anteriores deste doc estavam desatualizadas):

- Host escolhido: **Fly.io** (API, região `gru`) + **Cloudflare Pages** (web) +
  **Supabase** (Postgres, session pooler). Runbook em [`deploy.md`](./deploy.md).
- `apps/api/Dockerfile` multi-stage (`node:22.22.3-alpine`) e `apps/api/fly.toml` existem.
- Origens separadas (`app.` ↔ `api.`): o desenho de reverse proxy/mesma origem foi
  descartado. Cookie de sessão em `domain=.competa.com.br` com `SameSite=Lax` +
  Origin-check nas rotas mutantes (TASK-039).
- **Migrations no deploy**: `release_command` do `fly.toml` roda `drizzle-kit migrate` +
  seed antes de trocar a versão.
- **CI**: `.github/workflows/ci.yml` (build + lint + testes com `competa_test`); o deploy
  (API e web) roda no mesmo workflow **depois** do job de teste, só em push na `main`.
  Node unificado via `.nvmrc` (22.22.3) + `engines` no `package.json` raiz.

O que ainda falta:

1. **Chaves VAPID em produção.** `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (gere com
   `npx web-push generate-vapid-keys`). Sem elas o push fica desligado e a UI não oferece o
   recurso — a chave pública é servida por `GET /push/vapid-key`, então **não** há build novo
   do front para trocá-la.
2. **`DB_SSL_CA`** (CA da Supabase) como Fly secret — obrigatório desde a TASK-040
   (`rejectUnauthorized: true` em produção).

## 4. Observabilidade

O que já existe: `GET /health` (toca o banco), `enableShutdownHooks()`, `helmet()`,
`trust proxy` em produção e o `Logger` do Nest em toda falha de canal.

| Falta                    | Peso | Detalhe                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Rastreamento de erro~~ | ✅   | Sentry instalado (2026-09-11): `@sentry/nestjs` na API, `@sentry/angular` no web, DSN via env. `tracePropagationTargets` corrigido (2026-09-14) para ligar traces front→back entre origens separadas.                                                                                                         |
| ~~Log estruturado~~      | ✅   | 2026-09-14: `nestjs-pino` wired; JSON em produção, pretty em dev; todo log carrega `firmId`/`accountantId` e `reqId` automaticamente; `/health` excluído do auto-log; headers sensíveis redacted.                                                                                                             |
| ~~Métrica e alerta~~     | ✅   | 2026-09-14: `reportChannelFailure` envia evento Sentry com tags `{channel, purpose}` a cada falha de email/push; `@SentryCron` nos dois crons (`reminders-daily`, `deadline-daily`) alerta miss de execução. Regra de alerta no Sentry documentada em [`deploy.md`](./deploy.md#fora-deste-runbook) (COM-19). |

## 5. LGPD operacional

🟠 **O produto guarda documento fiscal de terceiros** — nota, extrato, folha — enviado por
pessoas que não são clientes da Pygmus, mas clientes do cliente. O tratamento é feito **como
operador**, por conta da Contabilidade (controladora). Estado:

1. ~~Política de privacidade e termos~~ — ✅ 2026-09-11: páginas `/termos` e `/privacidade`
   (conteúdo provisório até revisão jurídica), aceite registrado em `user.terms_accepted_at`
   nos 3 fluxos de criação de conta, com aviso nas telas.
2. **Contrato de operador** (→ **TASK-051**) com cada Contabilidade (o que o produto pode
   fazer com o dado, por quanto tempo, suboperadores usados — Cloudflare R2, Supabase e Resend).
3. ~~Retenção e expurgo~~ — ✅ política escrita em [`retention.md`](./retention.md)
   (prazos por tipo, 90 dias pós-cancelamento, runbook manual de expurgo Postgres+R2).
   Job automático adiado até o primeiro cancelamento real (gatilho no roadmap).
4. **Exportação e exclusão a pedido do titular** (arts. 18, IV e VI) (→ **TASK-052**). Hoje
   não há rota nem procedimento manual escrito. Inclui o `contact` e o `push_subscription` dele.
5. **Registro das operações de tratamento** (art. 37) (→ **TASK-053**) — o inventário de
   quais dados são coletados, por quê, e para onde vão.
6. **Plano de resposta a incidente** (art. 48) (→ **TASK-054**): quem é avisado, em quanto
   tempo, com que texto.
7. **Encarregado (DPO)** nomeado e um canal público de contato (→ **TASK-055**).

> Ordem sugerida: 1 e 3 primeiro (política + retenção) — são os que aparecem na primeira
> venda para uma contabilidade que tenha jurídico.

## 6. Backup e recuperação

✅ **2026-09-11: plano definido e implementado** — ver [`backup.md`](./backup.md).
`pg_dump` diário via GitHub Actions → bucket R2 dedicado (`competa-backups`, credencial
própria), retenção 7d/4w/12m por prefixo+lifecycle, runbook de restore com teste
trimestral, inventário de segredos. PITR adiado (decisão registrada lá). Falta só o setup
único: criar bucket/token/lifecycle na Cloudflare e cadastrar os 4 secrets no GitHub.
O plano original, para referência:

**Postgres**

- `pg_dump` diário para um bucket **diferente** do de documentos (provedor diferente, de
  preferência), com retenção 7 diários + 4 semanais + 12 mensais.
- Point-in-time recovery (WAL): no Supabase é add-on pago (não vem no Free nem no Pro
  puro) — decidir se entra no orçamento ou se o `pg_dump` diário é o RPO aceito por agora.
- **Restauração testada.** Backup nunca restaurado não é backup. Um teste trimestral de
  restore num banco descartável, com o resultado anotado.

**R2 (documentos)**

- Versionamento de objeto ligado no bucket (protege contra exclusão e sobrescrita).
- Replicação para um segundo bucket/região, ou um `rclone sync` agendado para outro
  provedor.
- O R2 e o Postgres precisam ser recuperáveis **para o mesmo instante**: `document.storage_key`
  sem o objeto é um zip que não abre (hoje o download já falha antes de começar, com 503 —
  mas o documento continua perdido).

**~~Cofre de segredos~~** ✅

~~`BETTER_AUTH_SECRET`, chaves do R2, `RESEND_API_KEY` e o par VAPID precisam existir fora
do host. Perder o `BETTER_AUTH_SECRET` invalida toda sessão; perder a VAPID privada mata
todas as inscrições de push já gravadas.~~ Inventário completo em [`backup.md`](./backup.md#segredos-inventário): Fly secrets + GitHub secrets são o cofre; produção falha nomeando a variável faltante.

## Correções já feitas (2026-09-09)

Ficam registradas aqui para que ninguém as reabra como pendência:

- **Build de produção** apontava para `http://localhost:3000`: faltava `fileReplacements` no
  `apps/web/angular.json`. Corrigido; `environment.prod.ts` agora é de fato usado.
- **Chave VAPID** saiu do bundle e passou a vir de `GET /push/vapid-key`.
- **Push nunca aparecia na tela**: o payload não tinha o formato
  `{ notification: { title, … } }` que o `ngsw-worker.js` exige, e o `message` era marcado
  como entregue mesmo assim.
- **XSS armazenado** via `content_type` declarado pelo Responsável: allowlist em
  `servedContentType()`, `inline` só para PDF/PNG/JPEG, e `nosniff` global pelo helmet.
- **Rate limit global** atrás de proxy: `trust proxy` em produção.
- **Import de CSV** sem limite e sem transação: cap de 1000 linhas no contrato + insert em
  lote numa transação.
- **Zip truncado com HTTP 200**: os objetos são conferidos antes do primeiro byte, e
  `finalize()` deixou de ser promise flutuante.
- **SSRF cego armazenado** pelo `endpoint` de push: allowlist de hosts de push.
- **`/access/recover`** invalidava o link vivo da vítima: cooldown de 15 min e o token só
  passa a valer depois que o email sai.
- **Sem helmet**, sem healthcheck, sem `enableShutdownHooks`: os três entraram.
- **Índices** em `document(request_id)`, `document(request_item_id)`,
  `upload_link(request_id)`, `contact(email)`, `contact(company_id)`.
- **`notify()` sem try/catch** derrubava o processo por unhandled rejection;
  `markDeadlineNotified` marcava antes de a entrega confirmar.
- **Cookie cross-subdomain** não configurado no Better Auth.

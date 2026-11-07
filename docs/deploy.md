# Deploy — runbook

Stack: **Supabase** (Postgres) + **Fly.io** (API, Docker) + **Cloudflare Pages** (web estático).
Domínio: `competa.com.br` (`app.` = web, `api.` = API). CI em `.github/workflows/`:
`ci.yml` roda em todo push/PR e, **só depois do job de teste passar**, os jobs de deploy
sobem API e web em push na `main` (2026-09-11: `deploy.yml` foi absorvido pelo `ci.yml`).
`backup.yml` roda o dump diário do Postgres — setup próprio em [`backup.md`](./backup.md).

Isto é o que só um humano com as contas pode fazer — depois do primeiro deploy manual, o
CI assume.

## 1. Supabase (Postgres)

1. Criar projeto em supabase.com, região `sa-east-1` (São Paulo).
2. Usar o nome do banco e o role de runtime definidos em [`conventions.md`](./conventions.md#credenciais-de-banco):
   database `competa`, role `competa_api`.
3. Settings → Database → Connection string → aba **Session pooler** (porta `5432`, IPv4,
   usuário no formato `postgres.<project-ref>`) — não a Direct connection (porta `5432` no
   host `db.<project-ref>.supabase.co`, só sai por IPv6 sem o add-on pago) nem o Transaction
   pooler (porta `6543`): esse último não sustenta sessão/prepared statement, e a API mantém
   pool próprio de vida longa via `pg`, não é a borda serverless que ele foi feito para servir.
4. Quebrar a connection string em `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` —
   copiar o usuário como veio (`postgres.<project-ref>`, não `postgres` puro).

## 2. Fly.io (API)

```bash
! flyctl auth login
flyctl apps create competa-api
flyctl secrets set -a competa-api \
  DB_HOST=... DB_PORT=5432 DB_USER=... DB_PASS=... DB_NAME=... \
  DB_SSL_CA="$(cat supabase-ca.crt)" \
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  BETTER_AUTH_URL=https://api.competa.com.br \
  WEB_URL=https://app.competa.com.br \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... \
  RESEND_API_KEY=... EMAIL_FROM=... \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:contato@competa.com.br \
  SENTRY_DSN=... \
  ASAAS_API_KEY=... ASAAS_WEBHOOK_TOKEN="$(openssl rand -hex 32)" \
  WHATSAPP_ENCRYPTION_KEY="$(openssl rand -hex 32)"

# SENTRY_DSN é secret, não [env] do fly.toml: o DSN aceita eventos de quem o tiver, e o
# fly.toml está no repositório. ASAAS_WEBHOOK_TOKEN é o mesmo valor cadastrado no painel do
# Asaas (webhook → token de autenticação). WHATSAPP_ENCRYPTION_KEY: 64 hex, sem ela a API
# não sobe. ASAAS_WEBHOOK_ALLOWED_IPS (opcional, IPs separados por vírgula): com ela o webhook
# só aceita o Fly-Client-IP listado e recusa o resto com 403; vazia, vale só o token. Os IPs de
# saída do Asaas mudam: confira a doc deles antes de ligar e ao ver 403 no log do webhook.

# gerar o par VAPID antes do set acima, se ainda não existir:
npx web-push generate-vapid-keys

# DB_SSL_CA (obrigatório desde a TASK-040 — sem ela o boot de produção falha):
# Supabase dashboard → Settings → Database → SSL Configuration → baixar o certificado CA
# (supabase-ca.crt) e passar o PEM inteiro no secret, como acima.

# primeiro deploy manual (a partir da raiz do repo)
flyctl deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

flyctl certs add api.competa.com.br -a competa-api
# segue a instrução impressa (CNAME api -> competa-api.fly.dev na Cloudflare, DNS-only —
# sem o proxy laranja, senão o handshake TLS do Fly não fecha)
# ⚠ HTTP-1 (audit): se um dia o app competa-api for deletado, REMOVA o CNAME ANTES —
# CNAME apontando para *.fly.dev órfão é candidato a subdomain takeover.
```

Token pro CI: `flyctl tokens create deploy -a competa-api` → secret `FLY_API_TOKEN` no GitHub.

### Uma máquina só, até o lock do checkout ir para o banco (COM-277)

A produção roda com **uma** máquina no Fly. O lock que serializa o checkout por firma
(`checkout-flight.ts`) vive na memória do processo: com duas máquinas, dois cliques que caem
em máquinas diferentes criam cliente e assinatura duplicados no Asaas (COM-276). Isso vale
até o lock por lease no banco estar em produção.

```bash
flyctl scale count 1 -a competa-api
flyctl machines list -a competa-api   # tem de listar uma máquina só
```

O `fly.toml` não tem como travar isso: não existe chave de contagem máxima de máquinas, e
`min_machines_running` é um piso, não um teto. Quem define a contagem é o `scale count`, e o
`flyctl deploy` mantém a que já existe. A exceção é o primeiro deploy de um app novo, que
sobe duas máquinas por padrão: rode o `scale count 1` logo depois dele. Confira o
`machines list` depois de qualquer mexida manual no app.

## 3. Cloudflare Pages (web e landing)

```bash
! wrangler login
wrangler pages project create competa-web
wrangler pages project create competa-landing
```

- No painel Cloudflare → Pages → `competa-web` → Custom domains → adicionar `app.competa.com.br`.
- No painel Cloudflare → Pages → `competa-landing` → Custom domains → adicionar `competa.com.br` e `www.competa.com.br`.
- Token pro CI: My Profile → API Tokens → criar um com permissão **Pages:Edit** → secret
  `CLOUDFLARE_API_TOKEN`; o Account ID (barra lateral do dashboard) → `CLOUDFLARE_ACCOUNT_ID`.
- Não precisa configurar build no painel — o `ci.yml` builda no CI e sobe via
  `npx wrangler pages deploy` (direct upload).
- Para deploy manual local da landing page: `pnpm --filter landing deploy:pages` (ou `pnpm --filter landing run deploy`, já que `pnpm deploy` sem o `run` é um comando nativo do pnpm).

## 4. Secrets no GitHub

Settings → Secrets and variables → Actions:

| Secret                        | De onde                                      |
| ----------------------------- | -------------------------------------------- |
| `FLY_API_TOKEN`               | passo 2                                      |
| `FLY_API_TOKEN_STAGING`       | passo 7 (environment `staging`)              |
| `CLOUDFLARE_API_TOKEN`        | passo 3                                      |
| `CLOUDFLARE_ACCOUNT_ID`       | passo 3                                      |
| `BACKUP_DATABASE_URL`         | [`backup.md`](./backup.md) (setup do backup) |
| `BACKUP_R2_ACCESS_KEY_ID`     | idem                                         |
| `BACKUP_R2_SECRET_ACCESS_KEY` | idem                                         |
| `BACKUP_R2_ENDPOINT`          | idem                                         |

## 5. Depois disso

- Todo push em `main` (merge de PR): `ci.yml` builda/lint/testa e, com o CI verde, sobe
  **staging** (`deploy-api-staging`, `deploy-web-staging`). Depois o run para em
  `approve-production` esperando aprovação: confira staging e clique em **Review
  deployments → Approve** no run. Só então `deploy-api`, `deploy-web` e `deploy-landing`
  sobem o mesmo commit para produção. Rejeitar (ou não aprovar) deixa a produção como está.
- Para testar um PR em staging antes do merge: Actions → CI → **Run workflow** na branch
  dele. Esse caminho nunca chega à produção.
- O portão é o environment `production` (Settings → Environments → `production` →
  **Required reviewers**: você). Sem revisor configurado o GitHub não espera, e a produção
  sobe logo depois de staging.
- Migrations rodam sozinhas — `release_command` no `fly.toml` roda
  `drizzle-kit migrate` antes do tráfego virar para a versão nova.
- Trocar a chave VAPID **não** exige rebuild do Angular (`GET /push/vapid-key` serve a
  pública); só atualizar o secret no Fly.

## 6. No primeiro cliente pagante (go-live)

Enquanto não há cliente, a API roda **scale-to-zero** (`min_machines_running = 0`) e os
crons **não disparam** — máquina parada não executa `@nestjs/schedule`. Com nenhuma
Contabilidade cadastrada os jobs não teriam trabalho, então a economia é de graça. Isso
deixa de valer no momento em que a primeira firm entra.

Antes de o primeiro Responsável receber um Link de Upload:

1. **Ligar a máquina always-on** em `apps/api/fly.toml` e fazer deploy:

   ```toml
   [http_service]
     auto_stop_machines = false
     auto_start_machines = true
     min_machines_running = 1
   ```

   Custo: ~US$3/mês (1 × `shared-cpu-1x` 512MB em `gru`, declarado em `[[vm]]` nos dois `fly*.toml`: com o default de 256MB o hash de senha de logins em paralelo levava o processo ao OOM kill). Também elimina o cold start
   do NestJS na primeira requisição do dia — que hoje cairia justamente em cima do
   Responsável clicando no link do email.

2. **Conferir no Sentry** que `reminders-daily` e `deadline-daily` passam a fazer check-in
   (Crons). Antes disso os monitores nem existem: o `@SentryCron` só cria o monitor no
   primeiro check-in.

3. **Exercitar os dois jobs antes**, logado como Contador, com dados de teste:
   `POST /reminders/run` e `POST /deadlines/scan` (ambos escopados à própria firm).
   `discardStaleUploads()` e `purgeExpiredFiscalDocuments()` **não** têm gatilho manual —
   só rodam pelo cron.

## 7. Staging

Mesma imagem e mesmo build da produção; o que muda é o app no Fly, o banco, o bucket, o
projeto no Pages e o Asaas em sandbox. Nada de staging encosta na produção: banco, bucket,
chaves VAPID e token de deploy são próprios.

- API: `competa-api-staging` (`apps/api/fly.staging.toml`) em `staging-api.competa.com.br`.
- Web: Pages `competa-web-staging` em `staging-app.competa.com.br`. Os dois sob
  `competa.com.br`: em `*.fly.dev` + `*.pages.dev` o cookie de sessão vira cross-site e o
  navegador o barra.
- Deploy: todo merge na `main` (antes da produção, ver passo 5), ou Actions → CI → **Run
  workflow** escolhendo a branch. Jobs `deploy-api-staging` e `deploy-web-staging`, só
  depois do CI verde.

Uma vez, com as contas:

1. **Supabase**: projeto novo (o gratuito basta), como no passo 1. Nunca apontar staging
   para o banco de produção: o `release_command` roda migrations e seed a cada deploy.
2. **R2**: bucket `competa-staging` e token de API restrito a ele.
3. **Fly**:

   ```bash
   flyctl apps create competa-api-staging
   flyctl secrets set -a competa-api-staging \
     DB_HOST=... DB_PORT=5432 DB_USER=... DB_PASS=... DB_NAME=competa \
     DB_SSL_CA="$(cat supabase-staging-ca.crt)" \
     BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
     R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=competa-staging \
     RESEND_API_KEY=... \
     VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:contato@competa.com.br \
     SENTRY_DSN=... \
     ASAAS_API_KEY='$aact_hmlg_...' ASAAS_WEBHOOK_TOKEN="$(openssl rand -hex 32)" \
     WHATSAPP_ENCRYPTION_KEY="$(openssl rand -hex 32)"
   flyctl deploy --config apps/api/fly.staging.toml --dockerfile apps/api/Dockerfile
   flyctl certs add staging-api.competa.com.br -a competa-api-staging
   flyctl tokens create deploy -a competa-api-staging   # → FLY_API_TOKEN_STAGING
   ```

   `SENTRY_ENVIRONMENT=staging` e `ASAAS_SANDBOX=true` já estão no `fly.staging.toml`. O
   `SENTRY_DSN` pode ser o mesmo da produção: o ambiente separa os eventos. Resend é o
   mesmo, então staging manda e-mail de verdade — teste com endereços seus.

4. **Cloudflare**: `wrangler pages project create competa-web-staging`; Custom domains →
   `staging-app.competa.com.br`; CNAME `staging-api` → `competa-api-staging.fly.dev`
   (DNS-only, como na produção).
5. **GitHub**: Settings → Environments → `staging` → secret `FLY_API_TOKEN_STAGING`; e
   Environments → `production` → **Required reviewers** (o portão do passo 5). O
   `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` do repositório já servem.
6. **Asaas sandbox**: webhook em `https://staging-api.competa.com.br/billing/webhook/asaas`
   com o mesmo `ASAAS_WEBHOOK_TOKEN` do secret.

Com `min_machines_running = 0` as varreduras das 7h e 9h só rodam com a máquina acordada:
para testar lembrete, use "Cobrar atrasados" no painel.

## 8. Checklist pré-lançamento nos painéis (COM-277)

O que o código não consegue provar. Conferir na mão, com acesso aos painéis, antes do
lançamento.

### Cloudflare R2 (bucket de produção)

- [ ] Acesso público **desligado**: sem `r2.dev` e sem domínio customizado conectado.
- [ ] CORS do bucket: `AllowedOrigins: ["https://app.competa.com.br"]`,
      `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["content-type", "x-amz-checksum-sha256"]`. Sem `*`.
      Sem o `x-amz-checksum-sha256` o preflight do navegador falha e todo envio quebra (COM-291).
      Vale para o bucket de staging também, antes do deploy.
- [ ] Token de API com escopo **só** neste bucket, permissão Object Read & Write. Não usar
      token de conta.
- [ ] Lifecycle rule `firm/` → apagar objetos com mais de **2 dias** (ver abaixo).

#### Lifecycle rule do prefixo `firm/` (COM-284)

O presign grava o arquivo em `firm/...`. Na confirmação, `R2Storage.seal` copia o objeto para
`sealed/firm/...` e apaga o original. Mas a URL de PUT vale 15 minutos
(`PRESIGN_TTL_SECONDS = 900`), e quem tem o link pode reenviar depois do seal: o objeto volta
a existir em `firm/...`, nenhuma linha do banco aponta para ele e a faxina de
`awaiting_upload` não o acha. O custo é só de storage, limitado pelo throttle do presign.

Painel do R2 → bucket de produção → Settings → Object lifecycle rules → Add rule:

- prefixo: `firm/`
- ação: apagar objetos **2 dias** depois de criados

Por que 2 dias: o envio que ainda não foi confirmado também mora em `firm/`, e a faxina do
cron de prazos (`STALE_UPLOAD_HOURS = 24`, em `deadline.cron.ts`) descarta a reserva sem
confirmação depois de 24 h. A regra precisa ser mais longa que essa janela, senão apaga o
arquivo de alguém que ainda pode confirmar. 1 dia empata com ela; 2 dias dão folga. Os
documentos confirmados vivem em `sealed/firm/...` e não são afetados.

> ⚠ O seal entrou com o PR #16. Documento confirmado **antes** dele ficou em `firm/...` com
> `storage_key` sem o `sealed/`, e a regra o apagaria. Antes de criar a regra num bucket que
> já tem documentos (staging, por exemplo), confira que a consulta abaixo volta 0. Se não
> voltar, mova esses objetos para `sealed/` e atualize o `storage_key` antes.
>
> ```sql
> select count(*) from document
> where upload_status <> 'awaiting_upload' and storage_key not like 'sealed/%';
> ```

### Asaas (produção)

- [ ] Webhook apontando para `https://api.competa.com.br/billing/webhook/asaas`.
- [ ] Token de autenticação do webhook igual ao secret `ASAAS_WEBHOOK_TOKEN` no Fly.
- [ ] Inscrito em todos os eventos `PAYMENT_*` e `SUBSCRIPTION_*`.
- [ ] Fila **ativa** (não pausada), sem penalização herdada de testes.
- [ ] Tipo de envio `SEQUENTIALLY` por enquanto. Só troque para `NON_SEQUENTIALLY` depois que
      o COM-275 estiver em produção (ver [seção 9](#9-runbook-fila-do-webhook-do-asaas-pausada-com-282)).

### Secrets de produção (Fly, app `competa-api`)

- [ ] `ASAAS_SANDBOX` ausente ou `false`.
- [ ] `ASAAS_API_KEY` é chave de produção (`$aact_prod_...`), não de homologação.

### Fly

- [ ] Uma máquina só: `flyctl scale count 1 -a competa-api`, conferido com
      `flyctl machines list -a competa-api` (ver
      [seção 2](#uma-máquina-só-até-o-lock-do-checkout-ir-para-o-banco-com-277)).

## 9. Runbook: fila do webhook do Asaas pausada (COM-282)

**Por que pausa.** Um evento que falha sempre "envenena" a fila. O exemplo conhecido é o
`reprice` da troca de plano (`changeSubscriptionPlan`), que roda dentro da transação do
evento de propósito: se o gateway falha, respondemos 503 e o Asaas reenvia. Se a falha é
permanente (a assinatura foi apagada à mão no painel do Asaas, por exemplo), o mesmo evento
responde 503 para sempre. O Asaas reenvia com intervalos crescentes (e-mails de alerta na 5ª
e na 10ª tentativa) e, depois de **15 falhas seguidas**, pausa a fila daquele webhook. No
modo `SEQUENTIALLY`, os eventos seguintes esperam o envenenado: nenhum pagamento novo chega
enquanto ele não sair da frente.

**Ver a fila.** Painel do Asaas → menu do usuário → **Integrações → Webhooks**. A
configuração pausada aparece como fila interrompida. Os **Logs de Webhooks** mostram, por
tentativa, o status HTTP, o payload e o horário: é por eles que se acha o evento que falha.
Do nosso lado, o Sentry e o log da API (`flyctl logs -a competa-api`) mostram o erro de
`POST /billing/webhook/asaas`.

**Reativar e reprocessar.**

1. Corrija a causa antes. Reativar sem corrigir pausa a fila de novo depois de mais 15
   falhas. No caso da assinatura apagada no Asaas, corrija o dado da firma (ou do Asaas) até o
   evento poder ser processado.
2. Reative a fila: **Integrações → Webhooks** → reativar a configuração interrompida. Pela
   API: `PUT /v3/webhooks/{id}` com `{ "interrupted": false }`.
3. Os eventos guardados durante a pausa são reenviados sozinhos depois da reativação, na
   ordem, no modo sequencial. Não há reprocessamento manual evento a evento.
4. Confira nos Logs de Webhooks que as entregas novas voltam 200.

Com a fila ainda ativa mas penalizada (antes da 15ª falha), o botão **Remover penalização**
(ou `POST /v3/webhooks/{id}/removeBackoff`) reenvia sem esperar o intervalo. Só use depois
de corrigir a causa: o endpoint tem rate limit apertado.

> ⚠ Evento guardado há mais de **14 dias** com a fila pausada é apagado pelo Asaas e não volta.
> Fila pausada é incidente do dia, não da semana.

**Plano: `NON_SEQUENTIALLY` depois do COM-275.** No modo não sequencial, um evento ruim não
segura os outros. Hoje o modo sequencial é necessário porque a ordem importa: um
`PAYMENT_OVERDUE` atrasado bloqueia firma que já pagou, e um `RECEIVED` tardio reativa firma
inadimplente (COM-275). Quando a correção do COM-275 estiver em produção, troque o tipo de
envio do webhook para `NON_SEQUENTIALLY` em **Integrações → Webhooks**.

**Alerta sugerido no Sentry.** Sentry → Alerts → Create Alert:

- tipo: _Issues_ (ou _Number of Errors_), ambiente `production`;
- filtro: transação/URL `POST /billing/webhook/asaas` com resposta não-2xx, ou o erro
  `GatewayUnavailable` vindo do webhook;
- condição: na primeira ocorrência. A fila pausa depois de cerca de 13 h de falhas seguidas, então
  o alerta precisa chegar bem antes disso;
- ação: e-mail/Slack de quem cuida da cobrança.

Vale também assinar o e-mail de alerta de penalização do Asaas (5ª e 10ª tentativas), que
chega antes da pausa.

## Fora deste runbook

- **Backup** (dump diário + bucket dedicado + restore): [`backup.md`](./backup.md).
- **Retenção/expurgo**: [`retention.md`](./retention.md).
- **Sentry e Alertas**:
  - DSN configurado via env nos dois apps (`@sentry/nestjs` e `@sentry/angular`).
  - **Regra de Alerta de Canal** (COM-19): criar em **Sentry > Alerts > Create Alert**:
    - **Tipo**: _Issues_ ou _Number of Errors_
    - **Filtro**: `tag[channel]:*` (ou `channel:email OR channel:push`)
    - **Ambiente**: `production`
    - **Condição**: Notificar imediatamente quando qualquer exceção com tag `channel` for capturada via `reportChannelFailure` (finalidades: `link_delivery`, `reminder`, `rejection`, `deadline_missed`, `completion`).
    - **Ações**: Enviar alerta para o canal Slack/Email da equipe de infraestrutura.
- Cobrança e WhatsApp seguem em [`next-steps.md`](./next-steps.md).

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
# não sobe.

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

- Todo push em `main`: `ci.yml` builda/lint/testa e, com o CI verde, os jobs `deploy-api`
  e `deploy-web` do mesmo workflow sobem API e web.
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

   Custo: ~US$2/mês (1 × `shared-cpu-1x` 256MB em `gru`). Também elimina o cold start
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
- Deploy: push na branch `staging`, ou Actions → CI → **Run workflow** escolhendo a branch.
  Jobs `deploy-api-staging` e `deploy-web-staging`, só depois do CI verde.

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
5. **GitHub**: Settings → Environments → `staging` → secret `FLY_API_TOKEN_STAGING`. O
   `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` do repositório já servem.
6. **Asaas sandbox**: webhook em `https://staging-api.competa.com.br/billing/webhook/asaas`
   com o mesmo `ASAAS_WEBHOOK_TOKEN` do secret.

Com `min_machines_running = 0` as varreduras das 7h e 9h só rodam com a máquina acordada:
para testar lembrete, use "Cobrar atrasados" no painel.

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

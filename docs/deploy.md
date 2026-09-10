# Deploy — runbook

Stack: **Supabase** (Postgres) + **Fly.io** (API, Docker) + **Cloudflare Pages** (web estático).
Domínio: `competa.com.br` (`app.` = web, `api.` = API). CI em `.github/workflows/`:
`ci.yml` roda em todo push/PR; `deploy.yml` builda e sobe os dois lados em todo push em `main`.

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
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  BETTER_AUTH_URL=https://api.competa.com.br \
  WEB_URL=https://app.competa.com.br \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... \
  RESEND_API_KEY=... EMAIL_FROM=... \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:contato@competa.com.br

# gerar o par VAPID antes do set acima, se ainda não existir:
npx web-push generate-vapid-keys

# primeiro deploy manual (a partir da raiz do repo)
flyctl deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

flyctl certs add api.competa.com.br -a competa-api
# segue a instrução impressa (CNAME api -> competa-api.fly.dev na Cloudflare, DNS-only —
# sem o proxy laranja, senão o handshake TLS do Fly não fecha)
```

Token pro CI: `flyctl tokens create deploy -a competa-api` → secret `FLY_API_TOKEN` no GitHub.

## 3. Cloudflare Pages (web)

```bash
! wrangler login
wrangler pages project create competa-web
```

- No painel Cloudflare → Pages → `competa-web` → Custom domains → adicionar `app.competa.com.br`.
- Token pro CI: My Profile → API Tokens → criar um com permissão **Pages:Edit** → secret
  `CLOUDFLARE_API_TOKEN`; o Account ID (barra lateral do dashboard) → `CLOUDFLARE_ACCOUNT_ID`.
- Não precisa configurar build no painel — o `deploy.yml` builda no CI e sobe via
  `cloudflare/pages-action` (direct upload).

## 4. Secrets no GitHub

Settings → Secrets and variables → Actions:

| Secret                  | De onde        |
| ------------------------ | --------------- |
| `FLY_API_TOKEN`          | passo 2          |
| `CLOUDFLARE_API_TOKEN`   | passo 3          |
| `CLOUDFLARE_ACCOUNT_ID`  | passo 3          |

## 5. Depois disso

- Todo push em `main`: `ci.yml` builda/lint/testa, `deploy.yml` sobe API e web.
- Migrations rodam sozinhas — `release_command` no `fly.toml` roda
  `drizzle-kit migrate` antes do tráfego virar para a versão nova.
- Trocar a chave VAPID **não** exige rebuild do Angular (`GET /push/vapid-key` serve a
  pública); só atualizar o secret no Fly.

## Fora deste runbook

Rastreamento de erro (Sentry), backup automatizado do Postgres/R2, LGPD operacional,
WhatsApp — inventariados em [`next-steps.md`](./next-steps.md).

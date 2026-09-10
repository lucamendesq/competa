# API — Coleta de Documentos Contábeis

Backend NestJS do SaaS de coleta de documentos contábeis: REST, autenticação (Better Auth), Postgres via Drizzle. Ver [`../../AGENTS.md`](../../AGENTS.md) e [`../../docs/`](../../docs/README.md) para o contexto completo do produto e da arquitetura.

## Subir localmente

```bash
# 1. variáveis de ambiente — ANTES do docker: o compose lê DB_* do .env
cp .env.template .env
# preencher: BETTER_AUTH_SECRET BETTER_AUTH_URL WEB_URL INVITE_TTL_DAYS
# (DB_* já vem preenchido com o que o docker-compose sobe: competa_api sem senha,
#  banco `competa`. BETTER_AUTH_URL não tem default e a API não sobe sem ele — use
#  http://localhost:3000 em desenvolvimento)

# 2. Postgres via docker compose (a partir de apps/api)
docker compose up -d

# 3. aplicar o schema no banco
pnpm --filter api drizzle-push

# 4. subir a API em modo watch
pnpm --filter api start:dev
```

A API sobe em `http://localhost:{PORT}` (padrão `3000`). Rotas do Better Auth ficam em `/api/auth/*`; as demais (nossas) não têm prefixo `/api`.

## Fluxo de ponta a ponta

Não há cadastro público — a primeira Contabilidade e o primeiro convite nascem por script.

```bash
# 1. cria a Contabilidade + imprime o link de convite do primeiro Contador
pnpm --filter api create-firm --name "Contabilidade Exemplo" --email contador@exemplo.com

# 2. o link impresso tem o formato {WEB_URL}/convite/{token}; extraia o token
#    e aceite o convite (cria o Contador e vincula à Contabilidade):
curl -X POST "http://localhost:3000/auth/sign-up?token=SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Nome do Contador","email":"contador@exemplo.com","password":"senha-forte-123"}'

# 3. login (rota do Better Auth, fora do envelope/catálogo de erro da API)
curl -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"contador@exemplo.com","password":"senha-forte-123"}'

# 4. consulta o Contador logado
curl -b cookies.txt http://localhost:3000/me
```

## Comandos úteis

| Comando                                                    | Para                                             |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `pnpm --filter api start:dev`                              | subir em modo watch                              |
| `pnpm --filter api lint`                                   | lint (inclui as regras de invariante de tenant)  |
| `pnpm --filter api build`                                  | build de produção                                |
| `pnpm --filter api drizzle-push`                           | aplicar `src/infra/database/schema/` no Postgres |
| `pnpm --filter api create-firm --name "..." --email "..."` | provisionar Contabilidade + convite              |

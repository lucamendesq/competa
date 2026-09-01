# Plano 01 — Fundação + Auth/Tenant

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provisionar uma Contabilidade por script, convidar Contadores por link, cadastrá-los, logá-los, e garantir por tipo que nenhuma query rode sem escopo de tenant.

**Architecture:** NestJS com módulos por feature. Portas de domínio são `abstract class` (DI do Nest), implementações vivem em `src/infra/`. Erros de negócio viajam como valor (`Result`) e só viram HTTP na borda, via `AppErrorFilter`. Escopo multi-tenant é um tipo *branded* (`FirmScope`) que só os guards de `modules/auth/` conseguem construir — repositório sem escopo não compila.

**Tech Stack:** TypeScript · pnpm workspace (sem Nx) · NestJS 12 · Drizzle ORM 1.0-rc · Postgres · Better Auth (`@thallesp/nestjs-better-auth`) · zod 4 (`@contabilidade/contracts`) · tsx

**Spec:** [`docs/superpowers/specs/2026-09-01-backend-mvp-design.md`](../specs/2026-09-01-backend-mvp-design.md)

## Global Constraints

- **Sem testes automatizados** — decisão do dono do produto. Cada task termina numa verificação manual executável. Não escreva `*.spec.ts`.
- **Either obrigatório**: todo use case retorna `PromiseResult<T, AppError>` de `src/lib/either.ts`. `throw` só para bug/infra.
- **DI por `abstract class`**: nunca `@Inject('TOKEN')` com string, nunca `interface` como token.
- **Drizzle SQL-like**: `db.select().from(t).where(and(eq(...)))`. Proibido `db.query.*`.
- **Validação só via `@contabilidade/contracts`** (zod). Nenhum schema zod definido dentro de `apps/api/src/modules/`.
- **Identificadores em inglês pelo glossário** de `docs/domain.md`: `accounting_firm`, `accountant`, `company`, `contact`, `period`, `request`. Proibidos soltos: `client`, `month`, `user` (exceto a tabela `user` do Better Auth).
- **Arquivos em kebab-case**: `sign-up.usecase.ts`, `tenant.guard.ts`.
- **Mensagens de erro em PT-BR**, exibíveis ao usuário final. `code` em SCREAMING_SNAKE.
- **Timestamps `timestamptz`**; PKs `uuid` com `uuidv7()` gerado na aplicação.
- **Tokens (convite e upload) só persistem como hash SHA-256.**
- Comandos rodam da raiz do repositório salvo indicação em contrário.

---

### Task 1: Workspace — `libs/contracts` e remoção do Nx

**Files:**
- Create: `libs/contracts/package.json`
- Create: `libs/contracts/tsconfig.json`
- Create: `libs/contracts/src/index.ts`
- Create: `libs/contracts/src/pagination.ts`
- Modify: `package.json` (raiz — scripts com `nx` → `pnpm -r`)
- Modify: `apps/api/package.json` (dependência workspace)

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: pacote `@contabilidade/contracts` exportando `PaginationQuery` (schema zod + tipo). Todas as tasks seguintes importam schemas daqui.

- [ ] **Step 1: Criar o package**

`libs/contracts/package.json`:
```json
{
  "name": "@contabilidade/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "peerDependencies": { "zod": "^4.4.3" },
  "devDependencies": { "typescript": "^6.0.2" }
}
```

`libs/contracts/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2023",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Primeiro schema compartilhado**

`libs/contracts/src/pagination.ts`:
```ts
import * as z from 'zod';

/** Query de paginação de toda coleção da API. Reflete o envelope { data, meta }. */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;
```

`libs/contracts/src/index.ts`:
```ts
export * from './pagination.js';
```

- [ ] **Step 3: Tirar o Nx dos scripts da raiz**

Em `package.json` (raiz), substituir o bloco `scripts` por:
```json
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
```
No mesmo arquivo, remover `"nx": "23.1.2"` de `devDependencies` e remover a chave `"workspaces"` inteira (quem define os pacotes é `pnpm-workspace.yaml`, que já contém `libs/*`).

- [ ] **Step 4: Ligar a API ao pacote**

Em `apps/api/package.json`, adicionar em `dependencies`:
```json
    "@contabilidade/contracts": "workspace:*",
```

- [ ] **Step 5: Instalar e compilar**

```bash
pnpm install
pnpm -r build
```
Esperado: `libs/contracts/dist/index.js` e `index.d.ts` existem; build da API passa.

> Em desenvolvimento, rode `pnpm --filter @contabilidade/contracts dev` num terminal à parte — a API consome `dist/`, não o fonte.

- [ ] **Step 6: Verificar o consumo pela API**

```bash
cd apps/api && npx tsx -e "import {PaginationQuery} from '@contabilidade/contracts'; console.log(PaginationQuery.parse({}))"
```
Esperado: `{ page: 1, perPage: 20 }`

- [ ] **Step 7: Commit**

```bash
git add libs package.json apps/api/package.json pnpm-lock.yaml
git commit -m "chore: libs/contracts como pacote pnpm e remocao do nx"
```

---

### Task 2: Erro e resposta padronizados

**Files:**
- Create: `apps/api/src/lib/app-error.ts`
- Create: `apps/api/src/lib/app-error.filter.ts`
- Create: `apps/api/src/lib/response.interceptor.ts`
- Modify: `apps/api/src/lib/zod-pipe.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: `Result`/`isFailure` de `src/lib/either.ts`
- Produces:
  - `abstract class AppError extends Error` com `code: string`, `status: number`, `details?: unknown`
  - `ValidationError`, `NotFound`, `Unauthenticated`, `Forbidden` (subclasses prontas)
  - `paginated<T>(data: T[], meta: { page: number; perPage: number; total: number })` → payload já envelopado
  - `AppErrorFilter`, `ResponseInterceptor` (registrados globalmente no `main.ts`)

- [ ] **Step 1: A classe base e os erros genéricos**

`apps/api/src/lib/app-error.ts`:
```ts
/** Erro de negócio. Viaja como valor dentro de Result e só vira HTTP no
 *  AppErrorFilter. `message` é PT-BR e exibível ao usuário final. */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly status = 422;
}

/** Também usado quando o recurso é de outro tenant — nunca revelar a diferença. */
export class NotFound extends AppError {
  readonly code = 'NOT_FOUND';
  readonly status = 404;

  constructor(message = 'Recurso não encontrado.') {
    super(message);
  }
}

export class Unauthenticated extends AppError {
  readonly code = 'UNAUTHENTICATED';
  readonly status = 401;

  constructor(message = 'Sessão inválida ou expirada.') {
    super(message);
  }
}

export class Forbidden extends AppError {
  readonly code = 'FORBIDDEN';
  readonly status = 403;

  constructor(message = 'Você não tem permissão para acessar isso.') {
    super(message);
  }
}
```

- [ ] **Step 2: O filter global**

`apps/api/src/lib/app-error.filter.ts`:
```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from './app-error.js';

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      return response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details === undefined ? {} : { details: exception.details }),
        },
      });
    }

    if (exception instanceof HttpException) {
      return response
        .status(exception.getStatus())
        .json({ error: { code: 'HTTP_ERROR', message: exception.message } });
    }

    // bug ou falha de infra: nunca vaza detalhe para o cliente
    this.logger.error(exception);
    return response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
  }
}
```

- [ ] **Step 3: O interceptor de envelope**

`apps/api/src/lib/response.interceptor.ts`:
```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map } from 'rxjs';

const ENVELOPED = Symbol('enveloped');

export type Meta = { page: number; perPage: number; total: number };

/** Marca um payload que já vem envelopado (coleção paginada).
 *  O símbolo não serializa em JSON, então some na resposta. */
export const paginated = <T>(data: T[], meta: Meta) => ({ data, meta, [ENVELOPED]: true });

/** Envelopa toda resposta JSON em { data }. Streams (zip) e 204 passam direto. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload === undefined || payload === null) return payload;
        if (payload instanceof StreamableFile) return payload;

        if (typeof payload === 'object' && ENVELOPED in payload) {
          const { data, meta } = payload as { data: unknown; meta: Meta };
          return { data, meta };
        }

        return { data: payload };
      }),
    );
  }
}
```

- [ ] **Step 4: `zodPipe` passa a falar a língua do padrão**

Substituir o corpo de `apps/api/src/lib/zod-pipe.ts` por:
```ts
import { PipeTransform } from '@nestjs/common';
import * as z from 'zod';
import { ValidationError } from './app-error.js';

/** Valida @Body/@Query/@Param contra um schema de @contabilidade/contracts.
 *  Chaves desconhecidas são removidas. */
export const zodPipe = (schema: z.ZodType): PipeTransform => ({
  transform(value: unknown) {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new ValidationError('Dados inválidos.', z.flattenError(result.error));
    }

    return result.data;
  },
});
```

- [ ] **Step 5: Registrar globalmente**

Substituir `apps/api/src/main.ts` por:
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import env from './config/env.js';
import { AppErrorFilter } from './lib/app-error.filter.js';
import { ResponseInterceptor } from './lib/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.useGlobalFilters(new AppErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({ origin: env.WEB_URL, credentials: true });

  await app.listen(env.PORT);
}
await bootstrap();
```

> `bodyParser: false` porque o `AuthModule.forRoot({ bodyParser })` do `@thallesp/nestjs-better-auth` já registra os parsers (o Better Auth precisa do corpo cru em `/api/auth/*`).

- [ ] **Step 6: Adicionar `WEB_URL` ao env**

Em `apps/api/src/config/env.ts`, dentro de `envSchema`:
```ts
  WEB_URL: z.url({ error: 'WEB_URL is required' }),
```
Em `apps/api/.env.template`, acrescentar ao final:
```
WEB_URL=http://localhost:4200
```
E no seu `.env` local, a mesma linha.

- [ ] **Step 7: Verificar**

```bash
cd apps/api && pnpm build && pnpm start:dev
```
Noutro terminal:
```bash
curl -s -i localhost:3000/auth/sign-up -X POST -H 'content-type: application/json' -d '{}'
```
Esperado: `HTTP/1.1 422` e corpo `{"error":{"code":"VALIDATION_ERROR","message":"Dados inválidos.","details":{...}}}`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib apps/api/src/main.ts apps/api/src/config/env.ts apps/api/.env.template
git commit -m "feat(api): envelope de resposta e formato de erro padronizados"
```

---

### Task 3: Schema — split por contexto, renomes e `invite`

**Files:**
- Create: `apps/api/src/infra/database/schema/columns.ts`
- Create: `apps/api/src/infra/database/schema/registry.ts`
- Create: `apps/api/src/infra/database/schema/relations.ts`
- Create: `apps/api/src/infra/database/schema/index.ts`
- Modify: `apps/api/src/infra/database/auth-schema.ts` → mover para `schema/auth.ts`
- Delete: `apps/api/src/infra/database/schema.ts`, `apps/api/src/infra/database/shared-schemas.ts`
- Modify: `apps/api/drizzle.config.ts`, `apps/api/src/infra/database/index.ts`, `apps/api/src/infra/auth/better-auth.ts`, `apps/api/src/modules/auth/usecases/SignUpUseCase.ts`, `apps/api/src/test/auth.ts`
- Modify: `docs/database-schema.md` (registrar D-01, D-03, D-04, D-07, §8.7)

**Interfaces:**
- Consumes: nada de tasks anteriores
- Produces: tabelas `accounting_firm`, `accountant`, `company`, `contact`, `invite` exportadas de `src/infra/database/schema/index.ts` (junto do re-export de `auth.ts`), mais `relations` para o `drizzle()`. Todas as tasks seguintes importam de `../../infra/database/schema/index.js`.

- [ ] **Step 1: Colunas compartilhadas**

`apps/api/src/infra/database/schema/columns.ts`:
```ts
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** PK padrão: uuidv7 gerado na aplicação (ordenação temporal de graça). */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};
```

> `public_id`/nanoid saem de vez (spec D-07). Se `nanoid` ficar sem nenhum import, remova a dependência de `apps/api/package.json`.

- [ ] **Step 2: Mover o schema do Better Auth**

```bash
cd apps/api && git mv src/infra/database/auth-schema.ts src/infra/database/schema/auth.ts
```
Em `src/infra/auth/better-auth.ts`, trocar o import para `'../database/schema/auth.js'`.

- [ ] **Step 3: O contexto registry**

`apps/api/src/infra/database/schema/registry.ts`:
```ts
import { boolean, check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { id, timestamps } from './columns.js';

export const accountingFirm = pgTable('accounting_firm', {
  id: id(),
  name: text().notNull(),
  ...timestamps,
});

export const accountant = pgTable('accountant', {
  id: id(),
  accountingFirmId: uuid('accounting_firm_id')
    .notNull()
    .references(() => accountingFirm.id, { onDelete: 'cascade' }),
  authUserId: uuid('auth_user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const company = pgTable('company', {
  id: id(),
  accountingFirmId: uuid('accounting_firm_id')
    .notNull()
    .references(() => accountingFirm.id),
  name: text().notNull(),
  cnpj: text(),
  flags: jsonb().notNull().default({}),
  active: boolean().notNull().default(true),
  ...timestamps,
});

/** Responsável da Empresa. `authUserId` é opcional: o fluxo de upload
 *  nunca exige conta; login existe só para push/App (spec D-04). */
export const contact = pgTable('contact', {
  id: id(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => company.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  email: text().notNull(),
  phone: text(),
  authUserId: uuid('auth_user_id')
    .unique()
    .references(() => user.id, { onDelete: 'set null' }),
  ...timestamps,
});

export const invite = pgTable(
  'invite',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    email: text().notNull(),
    accountingFirmId: uuid('accounting_firm_id').references(() => accountingFirm.id, {
      onDelete: 'cascade',
    }),
    companyId: uuid('company_id').references(() => company.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // um convite pertence a exatamente uma origem: firm OU empresa
    check(
      'invite_has_one_origin',
      sql`num_nonnulls(${t.accountingFirmId}, ${t.companyId}) = 1`,
    ),
  ],
);
```

> `checklist_template_id` em `company` entra na Fatia 3, junto da tabela `checklist_template`.

- [ ] **Step 4: Relations e barrel**

`apps/api/src/infra/database/schema/relations.ts`:
```ts
import { defineRelations } from 'drizzle-orm';
import { user } from './auth.js';
import { accountant, accountingFirm, company, contact, invite } from './registry.js';

export const relations = defineRelations(
  { accountingFirm, accountant, company, contact, invite, user },
  (r) => ({
    accountingFirm: {
      accountants: r.many.accountant(),
      companies: r.many.company(),
      invites: r.many.invite(),
    },
    accountant: {
      accountingFirm: r.one.accountingFirm({
        from: r.accountant.accountingFirmId,
        to: r.accountingFirm.id,
      }),
      user: r.one.user({ from: r.accountant.authUserId, to: r.user.id }),
    },
    company: {
      accountingFirm: r.one.accountingFirm({
        from: r.company.accountingFirmId,
        to: r.accountingFirm.id,
      }),
      contacts: r.many.contact(),
      invites: r.many.invite(),
    },
    contact: {
      company: r.one.company({ from: r.contact.companyId, to: r.company.id }),
      user: r.one.user({ from: r.contact.authUserId, to: r.user.id }),
    },
    invite: {
      accountingFirm: r.one.accountingFirm({
        from: r.invite.accountingFirmId,
        to: r.accountingFirm.id,
      }),
      company: r.one.company({ from: r.invite.companyId, to: r.company.id }),
    },
  }),
);
```

`apps/api/src/infra/database/schema/index.ts`:
```ts
export * from './auth.js';
export * from './registry.js';
export * from './relations.js';
```

- [ ] **Step 5: Apontar tudo para o novo caminho**

```bash
cd apps/api && rm src/infra/database/schema.ts src/infra/database/shared-schemas.ts
```
- `drizzle.config.ts`: `schema: './src/infra/database/schema/index.ts'`
- `src/infra/database/index.ts`: `import { relations } from './schema/index.js';`
- `src/modules/auth/usecases/SignUpUseCase.ts` e `src/test/auth.ts`: trocar `'../../../infra/database/schema.js'` (e equivalente) por `'.../schema/index.js'`; trocar `representative as representativeSchema` por `contact as contactSchema` e `accounting` por `accountingFirm`; o insert de `contact` passa a exigir `name` e `email` — use os do input do signup. O campo `invite.token` vira `invite.tokenHash` (a Task 7 reescreve esse use case; aqui basta compilar).

- [ ] **Step 6: Aplicar no banco**

```bash
cd apps/api && docker compose up -d && pnpm drizzle-push
```
Esperado: `drizzle-kit` cria `accounting_firm`, `accountant`, `company`, `contact`, `invite` sem erro.

```bash
psql "$DATABASE_URL_LOCAL" -c '\d invite'
```
Esperado: coluna `token_hash` única, `expires_at timestamptz`, check `invite_has_one_origin`.

- [ ] **Step 7: Atualizar o doc canônico**

Em `docs/database-schema.md`: renomear as tabelas, tornar `contact.auth_user_id` explicitamente nullable, adicionar o DDL de `invite` (spec §8.4), remover qualquer menção a `public_id`, e trocar a convenção `default gen_random_uuid()` por "uuidv7 gerado na aplicação". Em `docs/product.md`, corrigir "v1: único por tenant" para "N Contadores por Contabilidade, via convite".

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/infra/database apps/api/drizzle.config.ts apps/api/src apps/api/package.json docs/database-schema.md docs/product.md
git commit -m "refactor(db): schema por contexto, renomes do glossario e tabela invite"
```

---

### Task 4: Token opaco + script `create-firm`

**Files:**
- Create: `apps/api/src/lib/token.ts`
- Create: `apps/api/src/scripts/create-firm.ts`
- Modify: `apps/api/package.json` (script)
- Modify: `apps/api/src/config/env.ts`, `apps/api/.env.template` (`INVITE_TTL_DAYS`)

**Interfaces:**
- Consumes: `accountingFirm`, `invite` do schema (Task 3)
- Produces:
  - `createToken(): { token: string; tokenHash: string }`
  - `hashToken(token: string): string`
  - comando `pnpm --filter api create-firm --name "…" --email "…"` que imprime o link de convite

- [ ] **Step 1: Helper de token**

`apps/api/src/lib/token.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de convite e de Link de Upload: 32 bytes aleatórios em
 *  base64url. Só o hash é persistido — o claro existe uma única vez. */
export const createToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
```

- [ ] **Step 2: TTL do convite no env**

Em `apps/api/src/config/env.ts`, dentro de `envSchema`:
```ts
  INVITE_TTL_DAYS: z.string().optional().transform(Number).default(7),
```
Em `.env.template` e no `.env` local:
```
INVITE_TTL_DAYS=7
```

- [ ] **Step 3: O script de provisionamento**

`apps/api/src/scripts/create-firm.ts`:
```ts
import { parseArgs } from 'node:util';
import { addDays } from 'date-fns';
import { db } from '../infra/database/index.js';
import { accountingFirm, invite } from '../infra/database/schema/index.js';
import { createToken } from '../lib/token.js';
import env from '../config/env.js';

/** Provisionamento manual de uma Contabilidade (spec D-02): não há signup
 *  aberto nem rota de admin. Uso:
 *    pnpm --filter api create-firm --name "Contabilidade X" --email a@b.com */
const { values } = parseArgs({
  options: { name: { type: 'string' }, email: { type: 'string' } },
});

if (!values.name || !values.email) {
  console.error('uso: create-firm --name "Contabilidade X" --email contador@x.com.br');
  process.exit(1);
}

const { token, tokenHash } = createToken();

await db.transaction(async (tx) => {
  const [firm] = await tx
    .insert(accountingFirm)
    .values({ name: values.name! })
    .returning();

  await tx.insert(invite).values({
    tokenHash,
    email: values.email!,
    accountingFirmId: firm.id,
    expiresAt: addDays(new Date(), env.INVITE_TTL_DAYS),
  });

  console.log(`\nContabilidade criada: ${firm.name} (${firm.id})`);
  console.log(`Link de convite (válido por ${env.INVITE_TTL_DAYS} dias):`);
  console.log(`${env.WEB_URL}/convite/${token}\n`);
});

process.exit(0);
```

- [ ] **Step 4: Registrar o comando**

Em `apps/api/package.json`, dentro de `scripts`:
```json
    "create-firm": "tsx src/scripts/create-firm.ts",
```

- [ ] **Step 5: Verificar**

```bash
pnpm --filter api create-firm --name "Contabilidade Teste" --email luca@meetsummer.com
```
Esperado: id da firm e um link `http://localhost:4200/convite/<token>`.

```bash
psql "$DATABASE_URL_LOCAL" -c "select email, length(token_hash), accounting_firm_id is not null as from_firm from invite;"
```
Esperado: 1 linha, `length = 64` (hex do SHA-256), `from_firm = t`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/token.ts apps/api/src/scripts apps/api/package.json apps/api/src/config/env.ts apps/api/.env.template
git commit -m "feat(api): provisionamento de contabilidade por script com convite"
```

---

### Task 5: `FirmScope` e os guards de tenant

**Files:**
- Create: `apps/api/src/modules/auth/scope.ts`
- Create: `apps/api/src/modules/auth/tenant.guard.ts`
- Create: `apps/api/src/modules/auth/current-scope.decorator.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `accountant` do schema (Task 3); `Forbidden` de `lib/app-error.ts` (Task 2); `AuthGuard`, `AllowAnonymous` de `@thallesp/nestjs-better-auth`
- Produces:
  - `type FirmScope` (branded), `type UploadScope` (branded)
  - `toFirmScope(id: string): FirmScope` — **só pode ser importado por arquivos de `modules/auth/`**
  - `@CurrentScope()` — parameter decorator que injeta `FirmScope`
  - `TenantGuard` registrado como `APP_GUARD` global

- [ ] **Step 1: Os tipos branded**

`apps/api/src/modules/auth/scope.ts`:
```ts
declare const brand: unique symbol;

/** Escopo do tenant. Só os guards deste diretório constroem — fazer o cast
 *  em qualquer outro lugar é bug de segurança (LGPD/sigilo), não de estilo. */
export type FirmScope = string & { readonly [brand]: 'FirmScope' };

/** Escopo do Link de Upload: preso a UMA Solicitação e só-escrita. */
export type UploadScope = { requestId: string; contactId: string } & {
  readonly [brand]: 'UploadScope';
};

export const toFirmScope = (accountingFirmId: string) => accountingFirmId as FirmScope;

export const toUploadScope = (requestId: string, contactId: string) =>
  ({ requestId, contactId }) as UploadScope;
```

- [ ] **Step 2: O guard de tenant**

`apps/api/src/modules/auth/tenant.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountant } from '../../infra/database/schema/index.js';
import { Forbidden } from '../../lib/app-error.js';
import { toFirmScope } from './scope.js';

/** Roda depois do AuthGuard do Better Auth (que põe `session` no request).
 *  Resolve a Contabilidade do Contador logado e anexa o FirmScope. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext) {
    // 'PUBLIC' é a chave que @AllowAnonymous() grava (SetMetadata("PUBLIC", true))
    const isAnonymous = this.reflector.getAllAndOverride<boolean>('PUBLIC', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAnonymous) return true;

    const request = context.switchToHttp().getRequest();
    const authUserId = request.session?.user?.id;
    if (!authUserId) return true; // sem sessão: o AuthGuard já barrou

    const [row] = await this.db
      .select({ accountingFirmId: accountant.accountingFirmId })
      .from(accountant)
      .where(eq(accountant.authUserId, authUserId))
      .limit(1);

    // Responsável com App loga mas não é Contador — painel é fora do alcance dele
    if (!row) throw new Forbidden('Esta conta não pertence a uma Contabilidade.');

    request.firmScope = toFirmScope(row.accountingFirmId);
    return true;
  }
}
```

- [ ] **Step 3: O decorator de injeção**

`apps/api/src/modules/auth/current-scope.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FirmScope } from './scope.js';

/** Injeta o FirmScope produzido pelo TenantGuard. */
export const CurrentScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): FirmScope =>
    context.switchToHttp().getRequest().firmScope,
);
```

- [ ] **Step 4: Ligar os guards globalmente (seguro por padrão)**

Em `apps/api/src/app.module.ts`, no `BetterAuthModule.forRoot`, trocar `disableGlobalAuthGuard: true` por `disableGlobalAuthGuard: false` (ou remover a linha) e adicionar o `TenantGuard` aos providers:
```ts
import { APP_GUARD } from '@nestjs/core';
import { TenantGuard } from './modules/auth/tenant.guard.js';
// …
  providers: [{ provide: APP_GUARD, useClass: TenantGuard }],
```
A partir daqui **toda rota exige sessão**; rota pública precisa de `@AllowAnonymous()` explícito.

- [ ] **Step 5: Marcar as rotas públicas existentes**

Em `apps/api/src/modules/auth/auth.controller.ts`, anotar o handler `signUp` com `@AllowAnonymous()` (import de `@thallesp/nestjs-better-auth`).

- [ ] **Step 6: Verificar**

```bash
cd apps/api && pnpm start:dev
curl -s -i localhost:3000/me
```
Esperado: `401` com `{"error":{"code":"HTTP_ERROR",...}}` (a rota `/me` ainda não existe — o que importa é o guard barrar antes; se responder `404`, o guard global não está ativo).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/app.module.ts
git commit -m "feat(api): FirmScope branded e TenantGuard global"
```

---

### Task 6: Convites — criar e consultar

**Files:**
- Create: `libs/contracts/src/invite.ts`
- Modify: `libs/contracts/src/index.ts`
- Create: `apps/api/src/modules/auth/invite.repository.ts`
- Create: `apps/api/src/modules/auth/errors.ts`
- Create: `apps/api/src/modules/auth/invite.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `createToken`/`hashToken` (Task 4); `FirmScope`/`@CurrentScope` (Task 5); `AppError` (Task 2); tabela `invite` (Task 3)
- Produces:
  - `CreateInviteBody` (zod: `{ email }`) em `@contabilidade/contracts`
  - `InviteRepository` com `create(scope, { email, expiresAt, tokenHash })`, `findValidByToken(token)`, `markAccepted(inviteId)`
  - Erros `InviteNotFound`, `InviteExpired`, `InviteAlreadyAccepted`
  - `POST /invites` (autenticada) e `GET /invites/:token` (pública)

- [ ] **Step 1: Contrato**

`libs/contracts/src/invite.ts`:
```ts
import * as z from 'zod';

export const CreateInviteBody = z.object({ email: z.email() });
export type CreateInviteBody = z.infer<typeof CreateInviteBody>;

export const SignUpBody = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
});
export type SignUpBody = z.infer<typeof SignUpBody>;

export const InviteTokenParam = z.object({ token: z.string().min(1) });
export type InviteTokenParam = z.infer<typeof InviteTokenParam>;
```
Acrescentar em `libs/contracts/src/index.ts`:
```ts
export * from './invite.js';
```
E rebuildar: `pnpm --filter @contabilidade/contracts build`

- [ ] **Step 2: Erros do módulo**

`apps/api/src/modules/auth/errors.ts`:
```ts
import { AppError } from '../../lib/app-error.js';

export class InviteNotFound extends AppError {
  readonly code = 'INVITE_NOT_FOUND';
  readonly status = 404;

  constructor() {
    super('Convite não encontrado.');
  }
}

export class InviteExpired extends AppError {
  readonly code = 'INVITE_EXPIRED';
  readonly status = 410;

  constructor() {
    super('Este convite expirou. Peça um novo ao seu contador.');
  }
}

export class InviteAlreadyAccepted extends AppError {
  readonly code = 'INVITE_ALREADY_ACCEPTED';
  readonly status = 409;

  constructor() {
    super('Este convite já foi utilizado.');
  }
}

export class EmailAlreadyRegistered extends AppError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  readonly status = 409;

  constructor() {
    super('Já existe uma conta com este email.');
  }
}

export class InviteEmailMismatch extends AppError {
  readonly code = 'INVITE_EMAIL_MISMATCH';
  readonly status = 422;

  constructor() {
    super('Use o mesmo email para o qual o convite foi enviado.');
  }
}
```

> Acrescente `INVITE_EMAIL_MISMATCH` (422) ao catálogo do §5 da spec.

- [ ] **Step 3: Repositório**

`apps/api/src/modules/auth/invite.repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountingFirm, company, invite } from '../../infra/database/schema/index.js';
import { hashToken } from '../../lib/token.js';
import type { FirmScope } from './scope.js';

@Injectable()
export class InviteRepository {
  constructor(private readonly db: Database) {}

  async createForFirm(scope: FirmScope, input: { email: string; tokenHash: string; expiresAt: Date }) {
    const [row] = await this.db
      .insert(invite)
      .values({ ...input, accountingFirmId: scope })
      .returning();

    return row;
  }

  /** Busca pelo token em claro — só o hash existe no banco. Traz o nome da
   *  origem para a tela de convite ("Você foi convidado por X"). */
  async findByToken(token: string) {
    const [row] = await this.db
      .select({
        id: invite.id,
        email: invite.email,
        accountingFirmId: invite.accountingFirmId,
        companyId: invite.companyId,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt,
        firmName: accountingFirm.name,
        companyName: company.name,
      })
      .from(invite)
      .leftJoin(accountingFirm, eq(accountingFirm.id, invite.accountingFirmId))
      .leftJoin(company, eq(company.id, invite.companyId))
      .where(and(eq(invite.tokenHash, hashToken(token)), isNull(invite.deletedAt)))
      .limit(1);

    return row;
  }

  /** Aceita um executor opcional para participar da transação do signup. */
  async markAccepted(inviteId: string, tx: Database = this.db) {
    await tx.update(invite).set({ acceptedAt: new Date() }).where(eq(invite.id, inviteId));
  }
}
```

- [ ] **Step 4: Controller**

`apps/api/src/modules/auth/invite.controller.ts`:
```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CreateInviteBody, InviteTokenParam } from '@contabilidade/contracts';
import { addDays } from 'date-fns';
import env from '../../config/env.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { createToken } from '../../lib/token.js';
import { CurrentScope } from './current-scope.decorator.js';
import { InviteRepository } from './invite.repository.js';
import { InviteAlreadyAccepted, InviteExpired, InviteNotFound } from './errors.js';
import type { FirmScope } from './scope.js';

@Controller('invites')
export class InviteController {
  constructor(private readonly invites: InviteRepository) {}

  /** CRUD simples: sem use case (camada sob demanda). */
  @Post()
  async create(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(CreateInviteBody)) body: CreateInviteBody,
  ) {
    const { token, tokenHash } = createToken();
    const row = await this.invites.createForFirm(scope, {
      email: body.email,
      tokenHash,
      expiresAt: addDays(new Date(), env.INVITE_TTL_DAYS),
    });

    // o token em claro só existe aqui; a Fatia 6 troca isto por envio de email
    return { id: row.id, email: row.email, url: `${env.WEB_URL}/convite/${token}` };
  }

  @Get(':token')
  @AllowAnonymous()
  async preview(@Param(zodPipe(InviteTokenParam)) params: InviteTokenParam) {
    const row = await this.invites.findByToken(params.token);

    if (!row) throw new InviteNotFound();
    if (row.acceptedAt) throw new InviteAlreadyAccepted();
    if (row.expiresAt < new Date()) throw new InviteExpired();

    return {
      email: row.email,
      invitedBy: row.firmName ?? row.companyName,
      target: row.accountingFirmId ? 'accounting_firm' : 'company',
    };
  }
}
```

- [ ] **Step 5: Registrar no módulo**

Em `apps/api/src/modules/auth/auth.module.ts`, adicionar `InviteRepository` a `providers` e `InviteController` a `controllers`.

- [ ] **Step 6: Verificar**

```bash
cd apps/api && pnpm start:dev
curl -s localhost:3000/invites/token-que-nao-existe | jq
```
Esperado: `{"error":{"code":"INVITE_NOT_FOUND","message":"Convite não encontrado."}}`

Pegue o token impresso pelo `create-firm` da Task 4 e:
```bash
curl -s localhost:3000/invites/<TOKEN> | jq
```
Esperado: `{"data":{"email":"…","invitedBy":"Contabilidade Teste","target":"accounting_firm"}}`

```bash
curl -s -i -X POST localhost:3000/invites -H 'content-type: application/json' -d '{"email":"novo@x.com"}'
```
Esperado: `401` (sem sessão) — a rota autenticada está protegida.

- [ ] **Step 7: Commit**

```bash
git add libs/contracts apps/api/src/modules/auth
git commit -m "feat(api): criacao e consulta de convites"
```

---

### Task 7: Signup por convite

**Files:**
- Delete: `apps/api/src/modules/auth/usecases/SignUpUseCase.ts`
- Create: `apps/api/src/modules/auth/usecases/sign-up.usecase.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `InviteRepository` (Task 6); erros do módulo (Task 6); `AuthProvider` (já existe); `Result`/`PromiseResult` (já existe)
- Produces: `SignUpUseCase.execute({ token, name, email, password }): PromiseResult<{ userId: string }, AppError>`, e `POST /auth/sign-up?token=…` pública

- [ ] **Step 1: Erro de convite ainda não suportado**

Acrescentar em `apps/api/src/modules/auth/errors.ts`:
```ts
export class InviteTargetUnsupported extends AppError {
  readonly code = 'INVITE_TARGET_UNSUPPORTED';
  readonly status = 501;

  constructor() {
    super('Convite de Empresa ainda não está disponível.');
  }
}
```

> Convite com `company_id` só passa a funcionar na Fatia 3, quando `contact` tiver endpoints e o convite souber a qual `contact` se ligar. Até lá ele falha explicitamente em vez de gravar vínculo errado.

- [ ] **Step 2: Reescrever o use case**

```bash
cd apps/api && rm src/modules/auth/usecases/SignUpUseCase.ts
```

`apps/api/src/modules/auth/usecases/sign-up.usecase.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database } from '../../../infra/database/database.js';
import { accountant, user } from '../../../infra/database/schema/index.js';
import { AppError } from '../../../lib/app-error.js';
import { failure, isFailure, PromiseResult, success } from '../../../lib/either.js';
import { AuthProvider } from '../auth-provider.js';
import { InviteRepository } from '../invite.repository.js';
import {
  EmailAlreadyRegistered,
  InviteAlreadyAccepted,
  InviteEmailMismatch,
  InviteExpired,
  InviteNotFound,
  InviteTargetUnsupported,
} from '../errors.js';

export type SignUpInput = {
  token: string;
  name: string;
  email: string;
  password: string;
};

/** Aceitar convite é o ÚNICO caminho de cadastro (spec D-02): a Contabilidade
 *  nasce pelo script create-firm, nunca por rota pública. */
@Injectable()
export class SignUpUseCase {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthProvider,
    private readonly invites: InviteRepository,
  ) {}

  async execute(input: SignUpInput): PromiseResult<{ userId: string }, AppError> {
    const found = await this.invites.findByToken(input.token);

    if (!found) return failure(new InviteNotFound());
    if (found.acceptedAt) return failure(new InviteAlreadyAccepted());
    if (found.expiresAt < new Date()) return failure(new InviteExpired());
    if (found.email.toLowerCase() !== input.email.toLowerCase()) {
      return failure(new InviteEmailMismatch());
    }

    const { accountingFirmId } = found;
    if (!accountingFirmId) return failure(new InviteTargetUnsupported());

    const signUp = await this.auth.signUpEmail({
      name: input.name,
      email: input.email,
      password: input.password,
    });
    if (isFailure(signUp)) return failure(new EmailAlreadyRegistered());

    const { userId } = signUp.value;

    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(accountant).values({ authUserId: userId, accountingFirmId });
        await this.invites.markAccepted(found.id, tx);
      });

      return success({ userId });
    } catch (error) {
      // compensação: sem o vínculo, a conta criada no Better Auth é lixo
      await this.db.delete(user).where(eq(user.id, userId));
      throw error;
    }
  }
}
```

> A validação do convite acontece **antes** de criar a conta — assim um token inválido nunca deixa `user` órfão.

- [ ] **Step 3: Controller**

Substituir `apps/api/src/modules/auth/auth.controller.ts` por:
```ts
import { Body, Controller, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { InviteTokenParam, SignUpBody } from '@contabilidade/contracts';
import { isFailure } from '../../lib/either.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { SignUpUseCase } from './usecases/sign-up.usecase.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly signUpUseCase: SignUpUseCase) {}

  @Post('sign-up')
  @AllowAnonymous()
  async signUp(
    @Query(zodPipe(InviteTokenParam)) query: InviteTokenParam,
    @Body(zodPipe(SignUpBody)) body: SignUpBody,
  ) {
    const result = await this.signUpUseCase.execute({ ...body, token: query.token });

    if (isFailure(result)) throw result.error;

    return result.value;
  }
}
```

- [ ] **Step 4: Módulo**

Em `auth.module.ts`, trocar o import de `SignUpUseCase` para `./usecases/sign-up.usecase.js`.

- [ ] **Step 5: Verificar o caminho feliz**

```bash
pnpm --filter api create-firm --name "Contabilidade Verifica" --email contador@verifica.com
# copie o <TOKEN> do link impresso
curl -s -X POST "localhost:3000/auth/sign-up?token=<TOKEN>" \
  -H 'content-type: application/json' \
  -d '{"name":"Contador","email":"contador@verifica.com","password":"senha-forte-123"}' | jq
```
Esperado: `{"data":{"userId":"…"}}`

```bash
psql "$DATABASE_URL_LOCAL" -c "select a.id, f.name from accountant a join accounting_firm f on f.id = a.accounting_firm_id;"
```
Esperado: 1 linha ligando o Contador à "Contabilidade Verifica".

- [ ] **Step 6: Verificar os caminhos de falha**

```bash
# mesmo token de novo
curl -s -X POST "localhost:3000/auth/sign-up?token=<TOKEN>" -H 'content-type: application/json' \
  -d '{"name":"X","email":"contador@verifica.com","password":"senha-forte-123"}' | jq
```
Esperado: `INVITE_ALREADY_ACCEPTED` (409).

```bash
# email diferente do convite (use um token novo)
curl -s -X POST "localhost:3000/auth/sign-up?token=<NOVO_TOKEN>" -H 'content-type: application/json' \
  -d '{"name":"X","email":"outro@x.com","password":"senha-forte-123"}' | jq
```
Esperado: `INVITE_EMAIL_MISMATCH` (422), e **nenhum** `user` novo no banco.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(api): signup exclusivamente por convite"
```

---

### Task 8: `GET /me` e fechamento do fluxo

**Files:**
- Create: `apps/api/src/modules/auth/me.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: `@CurrentScope()`/`FirmScope` (Task 5); tabelas `accountant`, `accountingFirm`, `user` (Task 3)
- Produces: `GET /me` → `{ accountant: { id, name, email }, accountingFirm: { id, name } }`

- [ ] **Step 1: Controller**

`apps/api/src/modules/auth/me.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  accountant,
  accountingFirm,
  user,
} from '../../infra/database/schema/index.js';
import { NotFound } from '../../lib/app-error.js';
import { CurrentScope } from './current-scope.decorator.js';
import type { FirmScope } from './scope.js';

@Controller('me')
export class MeController {
  constructor(private readonly db: Database) {}

  @Get()
  async me(@CurrentScope() scope: FirmScope) {
    const [row] = await this.db
      .select({
        accountantId: accountant.id,
        name: user.name,
        email: user.email,
        firmId: accountingFirm.id,
        firmName: accountingFirm.name,
      })
      .from(accountant)
      .innerJoin(user, eq(user.id, accountant.authUserId))
      .innerJoin(accountingFirm, eq(accountingFirm.id, accountant.accountingFirmId))
      .where(eq(accountant.accountingFirmId, scope))
      .limit(1);

    if (!row) throw new NotFound();

    return {
      accountant: { id: row.accountantId, name: row.name, email: row.email },
      accountingFirm: { id: row.firmId, name: row.firmName },
    };
  }
}
```

> Esta query filtra pelo `scope`, não pelo usuário da sessão — na Fatia 2 há um Contador por firm no fluxo verificado. Quando a firm tiver vários Contadores (já é possível via convite), troque o `where` por `eq(accountant.authUserId, sessionUserId)` **mantendo** o filtro de escopo. Anote isso como o primeiro ajuste da Fatia 3.

- [ ] **Step 2: Registrar**

Adicionar `MeController` a `controllers` em `auth.module.ts`.

- [ ] **Step 3: Verificar o fluxo inteiro com sessão**

```bash
cd apps/api && pnpm start:dev
# login
curl -s -c /tmp/cookies.txt -X POST localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"contador@verifica.com","password":"senha-forte-123"}' | jq
# rota escopada
curl -s -b /tmp/cookies.txt localhost:3000/me | jq
```
Esperado: `{"data":{"accountant":{…},"accountingFirm":{"name":"Contabilidade Verifica"}}}`

```bash
# convidar um segundo contador, já com sessão
curl -s -b /tmp/cookies.txt -X POST localhost:3000/invites \
  -H 'content-type: application/json' -d '{"email":"socio@verifica.com"}' | jq
```
Esperado: `{"data":{"id":"…","email":"socio@verifica.com","url":"http://localhost:4200/convite/…"}}`

```bash
# sem cookie
curl -s -i localhost:3000/me | head -1
```
Esperado: `HTTP/1.1 401`

- [ ] **Step 4: Marcar o roadmap**

Em `docs/roadmap.md`, marcar TASK-003, TASK-004 e TASK-005 como concluídas e substituir o título de TASK-004 por "Provisionamento por script + signup por convite (spec D-02)".

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth docs/roadmap.md
git commit -m "feat(api): rota /me escopada por tenant"
```

---

## Estado ao fim deste plano

Funcionando de ponta a ponta: `create-firm` → link de convite → `POST /auth/sign-up?token=` → login por cookie → `GET /me` escopado → `POST /invites` para o próximo Contador. Toda rota é autenticada por padrão; pública exige `@AllowAnonymous()` explícito; nenhum repositório de tenant compila sem `FirmScope`.

## Próximos planos

| Plano | Conteúdo | Depende |
|---|---|---|
| 02 — Registry | `document_type` + catálogo, `checklist_template(_item)` + 5 templates fixos, `company`, `contact`, import CSV/XLSX, overrides, `getEffectiveChecklist` | 01 |
| 03 — Coleta | `period`, abrir Competência (fan-out + snapshot + `due_date`), `upload_link` | 02 |
| 04 — Upload público | `UploadTokenGuard`, `StorageProvider`/R2, `document`, multi-arquivo, limites, Extra | 03 |
| 05 — Messaging | `EmailProvider`/Resend, `message`, envio na abertura, cron de lembretes, `DeadlineMissed` | 04 |
| 06 — Revisão | revisão em lote, reabertura + reenvio, auto-`complete`, Painel de Pendências, encerramento | 05 |
| 07 — Entrega | zip por Empresa/Competência e por Competência inteira | 04 |

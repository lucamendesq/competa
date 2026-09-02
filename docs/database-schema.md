# Database Schema — Coleta de Documentos Contábeis

> **Fonte canônica da estrutura de banco.** Todo código que toque persistência DEVE seguir este documento; divergência entre migration e este doc é bug — corrija um dos dois na mesma PR.
> Nomes de tabelas/colunas em **inglês**, snake_case singular. Glossário PT↔EN em [`domain.md`](./domain.md#glossário-linguagem-ubíqua-pten).
> Postgres + Drizzle ORM — schema e migrations vivem em `apps/api/src/database/`. Auth: Better Auth — tabelas `user`, `session`, `account`, `verification` são gerenciadas pela biblioteca (adapter Drizzle) e não são redefinidas aqui.

## Visão geral (quem referencia quem)

```
REGISTRY (Cadastro)                       COLLECTION (Coleta — CORE)
document_type ◄── checklist_template_item      period ◄── request ◄── request_item ◄── document
      ▲                    │                                  │                          (1:N)
      │             checklist_template          upload_link ──┘
      │                    ▲
company_checklist_override │              MESSAGING (Comunicação)
      ▲                    │              message (log/outbox de envios e lembretes)
      │                    │
   company ────────────────┘ ◄── contact
      ▲
accounting_firm (tenant) ◄── accountant ──► [Better Auth: user/session/account/verification]
```

Direção de dependência (convenção): `registry` → `collection` → `messaging`. Mapeamento: registry = `modules/companies` + `modules/checklists`; collection = `modules/periods` + `modules/requests`; messaging = `modules/messaging`.

## Convenções

1. PK `uuid`; `id` gerado como `uuidv7()` **na aplicação** (não `default gen_random_uuid()` — ordenação temporal de graça; §8.7 do spec). FKs com sufixo `_id`.
2. Estados como `text` + `check` constraint (nunca enum nativo do Postgres — migração dolorosa).
3. Toda tabela alcança `accounting_firm_id` (direto ou por join) — **isolamento por tenant é obrigação da camada de aplicação**: guards da API Nest injetam `FirmScope`/`UploadScope` (tipos branded) e todo repositório os exige por assinatura. RLS nativa é endurecimento futuro.
4. `accounting_firm_id IS NULL` em `document_type`/`checklist_template` = registro **seed do produto**, imutável pelas Contabilidades.
5. Timestamps `timestamptz`; `created_at` default `now()` em toda tabela (omitido abaixo por brevidade — incluir na migration).

## DDL

### registry (Cadastro)

```sql
create table accounting_firm (            -- Contabilidade (tenant raiz)
  id    uuid primary key,
  name  text not null
);

create table accountant (                 -- Contador (N por Contabilidade, via convite — D-01)
  id                  uuid primary key,
  accounting_firm_id  uuid not null references accounting_firm(id),
  auth_user_id        uuid not null unique references "user"(id),   -- Better Auth user.id
  name                text not null,
  email               text not null
);

create table document_type (              -- Catálogo (dicionário) de documentos
  id                  uuid primary key,
  accounting_firm_id  uuid references accounting_firm(id),  -- NULL = seed do produto
  name                text not null,      -- conteúdo em PT-BR (dado, não identificador)
  category            text not null check (category in
                        ('fiscal','financial','expense','payroll','tax','corporate')),
  accepted_formats    text[] not null default '{pdf}',      -- ex.: {xml,pdf,zip}
  description         text                -- instrução exibida ao Responsável
);

create table checklist_template (         -- Template de Checklist ("Template ME"…)
  id                  uuid primary key,
  accounting_firm_id  uuid references accounting_firm(id),  -- NULL = template fixo do produto
  name                text not null,
  derived_from        uuid references checklist_template(id) -- rastreia cópia do fixo
);

create table checklist_template_item (    -- composição N:N template ↔ documento
  id                     uuid primary key,
  checklist_template_id  uuid not null references checklist_template(id),
  document_type_id       uuid not null references document_type(id),
  periodicity            text not null default 'monthly'
                           check (periodicity in ('monthly','annual','on_demand')),
  annual_month           smallint,        -- só p/ annual: 12 = inventário em dezembro
  due_day                smallint,        -- dia do vencimento; NULL = herda da competência
  due_month_offset       smallint not null default 1,
                           -- 0 = vence no mês de referência (folha); 1 = mês seguinte (extrato)
  condition_flag         text,            -- NULL = sempre; 'has_employees' = só se company.flags o tiver
  required               boolean not null default true,
  unique (checklist_template_id, document_type_id)
);

create table company (                    -- Empresa (cliente da Contabilidade)
  id                     uuid primary key,
  accounting_firm_id     uuid not null references accounting_firm(id),
  checklist_template_id  uuid not null references checklist_template(id), -- escolhido no cadastro
  name                   text not null,
  cnpj                   text,
  flags                  jsonb not null default '{}',
                           -- {"has_employees": bool, "accepts_card_payments": bool, "has_inventory": bool}
  active                 boolean not null default true
);

create table contact (                    -- Responsável (recebe o link, envia documentos)
  id            uuid primary key,
  company_id    uuid not null references company(id),
  name          text not null,
  email         text not null,            -- invariante: sem email não há Solicitação
  phone         text,                     -- habilita WhatsApp
  auth_user_id  uuid unique references "user"(id)
                                          -- nullable (D-04): login do Responsável é opcional,
                                          -- preenchido só se cadastrar no App; upload nunca exige conta
);

create table invite (                     -- Convite (D-03): serve os dois casos —
                                          -- convidar Contador (accounting_firm_id) ou
                                          -- convidar Responsável para o App (company_id)
  id                  uuid primary key,
  token_hash          text not null unique,     -- nunca o token em claro (mesmo padrão de upload_link)
  email               text not null,            -- para quem o convite foi emitido
  accounting_firm_id  uuid references accounting_firm(id) on delete cascade,
  company_id          uuid references company(id) on delete cascade,
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  deleted_at          timestamptz,
  constraint invite_has_one_origin check (num_nonnulls(accounting_firm_id, company_id) = 1)
);

create table company_checklist_override ( -- edição leve por Empresa
  id                uuid primary key,
  company_id        uuid not null references company(id),
  document_type_id  uuid not null references document_type(id),
  action            text not null check (action in ('add','remove')),
  -- campos abaixo exigidos quando action = 'add' (espelham checklist_template_item):
  periodicity       text check (periodicity in ('monthly','annual','on_demand')),
  annual_month      smallint,
  due_day           smallint,
  due_month_offset  smallint,
  unique (company_id, document_type_id)
);
```

### collection (Coleta — CORE)

```sql
create table period (                     -- Competência
  id                  uuid primary key,
  accounting_firm_id  uuid not null references accounting_firm(id),
  reference_month     date not null,     -- sempre dia 1: 2026-07-01 = competência 2026-07
  status              text not null default 'open' check (status in ('open','closed')),
  due_date            date,              -- prazo geral opcional (fallback dos itens)
  unique (accounting_firm_id, reference_month)  -- invariante: só abre uma vez
);

create table request (                    -- Solicitação (UMA Empresa em UMA Competência)
  id          uuid primary key,
  period_id   uuid not null references period(id),
  company_id  uuid not null references company(id),
  status      text not null default 'open' check (status in ('open','complete','closed')),
  closed_at   timestamptz,
  unique (period_id, company_id)          -- invariante: uma por Empresa por Competência
);

create table request_item (               -- Item — SNAPSHOT congelado na abertura
  id                uuid primary key,
  request_id        uuid not null references request(id),
  document_type_id  uuid references document_type(id),  -- só p/ relatórios; campos abaixo são cópia
  name              text not null,        -- copiado do document_type na abertura
  description       text,                 -- copiado
  accepted_formats  text[] not null,      -- copiado
  due_date          date,                 -- congelado: reference_month + due_month_offset + due_day;
                                          -- NULL → herda period.due_date → sem prazo
  status            text not null default 'pending'
                      check (status in ('pending','submitted','accepted','rejected'))
);
create index request_item_pending_idx on request_item (request_id, status); -- Painel de Pendências

create table document (                   -- arquivo enviado (1 Item : N Documentos)
  id                uuid primary key,
  request_id        uuid not null references request(id),
  request_item_id   uuid references request_item(id),   -- NULL = Documento Extra
  storage_key       text not null,        -- caminho no R2
  file_name         text not null,
  content_type      text not null,
  size_bytes        bigint not null,
  uploaded_at       timestamptz not null default now(),
  review_status     text not null default 'pending'
                      check (review_status in ('pending','accepted','rejected')),
  rejection_reason  text
);

create table upload_link (                -- Link de Upload (token próprio; NÃO é sessão/auth)
  id          uuid primary key,
  request_id  uuid not null references request(id),
  contact_id  uuid not null references contact(id),
  token_hash  text not null unique,       -- nunca o token em claro
  expires_at  timestamptz not null,
  revoked     boolean not null default false
);
```

### messaging (Comunicação)

```sql
create table message (                    -- log/outbox de tudo que sai
  id          uuid primary key,
  request_id  uuid not null references request(id),
  channel     text not null check (channel in ('email','whatsapp','push')),
  purpose     text not null check (purpose in
                ('link_delivery','reminder','rejection','deadline_missed','completion')),
  recipient   text not null,
  status      text not null default 'queued'
                check (status in ('queued','sent','delivered','failed')),
  sent_at     timestamptz
);
create index message_reminder_idx on message (request_id, purpose);
-- cadência máx. 2 lembretes = count(*) where purpose='reminder' por request (sem tabela extra)
```

## Consultas/algoritmos canônicos

### Checklist efetivo de uma Empresa (template − removidos + adicionados)

```sql
select dt.id, dt.name, dt.accepted_formats, dt.description,
       ti.periodicity, ti.annual_month, ti.due_day, ti.due_month_offset
from checklist_template_item ti
join document_type dt on dt.id = ti.document_type_id
where ti.checklist_template_id = (select checklist_template_id from company where id = :company_id)
  and dt.id not in (select document_type_id from company_checklist_override
                    where company_id = :company_id and action = 'remove')
union all
select dt.id, dt.name, dt.accepted_formats, dt.description,
       o.periodicity, o.annual_month, o.due_day, o.due_month_offset
from company_checklist_override o
join document_type dt on dt.id = o.document_type_id
where o.company_id = :company_id and o.action = 'add';
```

### Fan-out de "Abrir a Competência" (por Empresa ativa com contact.email)

1. Criar `period` (falha se `unique (accounting_firm_id, reference_month)` violada).
2. Para cada `company` ativa com `contact.email`: criar `request`.
3. Para cada linha do **checklist efetivo** da Empresa, filtrar:
   - `periodicity = 'monthly'` → entra sempre; `'annual'` → só se `extract(month from reference_month) = annual_month`; `'on_demand'` → nunca entra no fan-out (vira override ou Documento Extra);
   - `condition_flag IS NULL OR company.flags->>condition_flag = 'true'`.
4. Criar `request_item` com snapshot (name, description, accepted_formats) e `due_date` calculado: `reference_month + (due_month_offset || interval month) + due_day`, senão `NULL` (herda `period.due_date`).
5. Gerar `upload_link` (token aleatório ≥ 32 bytes; armazenar só o hash) e emitir evento `RequestCreated` → `messaging`.

### Regras de upload (rotas públicas do Link de Upload — `UploadTokenGuard`)

- Valida `token_hash` + `expires_at` + `revoked` e injeta `UploadScope` limitado àquela `request`; escopo **só-upload** (a página exibe nomes/status dos itens; NUNCA lista/baixa conteúdo de documentos).
- Upload direto ao R2 via URL pré-assinada (4–6 concorrentes); backend só emite URLs e insere `document`.
- Limites: 100 MB/arquivo; 500 arquivos/envio. Zip aceito como formato, **sem extração**.
- `request.status = 'closed'` → só aceita Documento Extra (`request_item_id IS NULL`).

## Transições de estado

| Entidade | Transições |
|----------|-----------|
| `request_item.status` | `pending → submitted` (upload) `→ accepted` \| `rejected` (Revisão); `rejected → pending` (reabertura, dispara reenvio de link SÓ por email) |
| `request.status` | `open → complete` (todos os itens `accepted`, automático); `open\|complete → closed` (ato do Contador; pode fechar com pendências, com aviso) |
| `period.status` | `open → closed` (ato do Contador) |
| `document.review_status` | `pending → accepted` \| `rejected` — Revisão em lote opera no Item (aceita todos os `document` do item de uma vez) |

## Seed

O conteúdo do seed (tipos de documento e templates fixos MEI / Simples Serviços / Simples Comércio / Lucro Presumido / Lucro Real) está em [`document-catalog.md`](./document-catalog.md). O seed é idempotente: uma parte mínima entra cedo (destrava templates e cadastro de Empresa) e o conteúdo completo depois. Ver [`roadmap.md`](./roadmap.md) para a ordem das fatias.

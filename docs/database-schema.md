# Database Schema — Coleta de Documentos Contábeis

> **Fonte canônica da estrutura de banco.** Todo código que toque persistência DEVE seguir este documento; divergência entre migration e este doc é bug — corrija um dos dois na mesma PR.
> Nomes de tabelas/colunas em **inglês**, snake_case singular. Glossário PT↔EN em [`domain.md`](./domain.md#glossário-linguagem-ubíqua-pten).
> Postgres + Drizzle ORM — schema e migrations vivem em `apps/api/src/infra/database/schema/`. Auth: Better Auth — tabelas `user`, `session`, `account`, `verification` são gerenciadas pela biblioteca (adapter Drizzle) e não são redefinidas aqui.

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
      ▲            ▲
      │            └── invite (origem: company)
accounting_firm (tenant) ◄── accountant ──► [Better Auth: user/session/account/verification]
      ▲
      └── invite (origem: accounting_firm)
```

Direção de dependência (convenção): `registry` → `collection` → `messaging`. Mapeamento: registry = `modules/companies` + `modules/checklists`; collection = `modules/periods` + `modules/requests`; messaging = `modules/messaging`.

## Convenções

1. PK `uuid`; `id` gerado como `uuidv7()` **na aplicação** (não `default gen_random_uuid()` — ordenação temporal de graça; §8.7 do spec). FKs com sufixo `_id`.
2. Estados como `text` + `check` constraint (nunca enum nativo do Postgres — migração dolorosa).
3. Toda tabela alcança `accounting_firm_id` (direto ou por join) — **isolamento por tenant é obrigação da camada de aplicação**: guards da API Nest injetam `FirmScope`/`UploadScope`/`ContactScope` (tipos branded) e todo repositório os exige por assinatura. **Row-Level Security (RLS) está habilitada em todas as tabelas do schema `public`** (`enableRLS()`) com default-deny para blindar o PostgREST/Supabase HTTP contra acesso não autorizado (COM-57 e COM-58), com privilégios revogados dos roles `anon` e `authenticated`. A API Nest conecta como owner/superuser (`BYPASSRLS`), operando sem restrições. Políticas de tenant no RLS permanecem como endurecimento futuro caso desejado.
4. `accounting_firm_id IS NULL` em `document_type`/`checklist_template` = registro **seed do produto**, imutável pelas Contabilidades.
5. Timestamps `timestamptz`; `created_at` default `now()` em toda tabela (omitido abaixo por brevidade — incluir na migration).

## DDL

### registry (Cadastro)

```sql
create table accounting_firm (            -- Contabilidade (tenant raiz)
  id            uuid primary key,
  name          text not null,
  logo_url      text,                         -- URL pública do logotipo
  contact_email text,                         -- E-mail público de contato da contabilidade
  -- preferências de lembrete (2026-09-11): a cadência do cron é por tenant;
  -- defaults reproduzem o comportamento histórico (regras em reminder-rules.ts)
  reminder_max            smallint not null default 2,  -- máx. lembretes por Solicitação
  reminder_due_soon_days  smallint not null default 3,  -- começa a lembrar em D-N
  reminder_gap_days       smallint not null default 3,  -- gap mínimo entre lembretes
  constraint accounting_firm_reminder_chk check (
    reminder_max between 0 and 10
    and reminder_due_soon_days between 0 and 31
    and reminder_gap_days between 1 and 31)
);

create table accountant (                 -- Contador (N por Contabilidade, via convite — D-01)
                                          -- name/email vivem em "user" (Better Auth); /me lê via join
                                          -- por auth_user_id — não duplicar aqui
  id                  uuid primary key,
  accounting_firm_id  uuid not null references accounting_firm(id) on delete cascade,
  auth_user_id        uuid not null unique references "user"(id) on delete cascade,
  owner               boolean not null default false  -- dono: o 1º Contador (quem provisiona
);                                                    -- via create-firm). SÓ ele cria convite.

-- Uma Contabilidade tem no máximo um dono. Quem arbitra é o banco: dois signups
-- simultâneos passariam por uma checagem feita em JS.
create unique index accountant_owner_uidx on accountant (accounting_firm_id) where owner;

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
  checklist_template_id  uuid not null references checklist_template(id) on delete cascade,
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
                                          -- sem on delete: apagar uma Contabilidade com Empresas
                                          -- falha por FK — proteção intencional
  checklist_template_id  uuid references checklist_template(id), -- opcional; NULL = sem template (empresa não entra no fan-out)
  name                   text not null,
  cnpj                   text,                 -- só dígitos; validado com DV (módulo 11)
  flags                  jsonb not null default '{}',
                           -- {"has_employees": bool, "accepts_card_payments": bool, "has_inventory": bool}
                           -- PATCH /companies/:id MESCLA (jsonb ||): mandar uma flag não
                           -- apaga as outras. Trocar uma flag para false exige mandá-la
                           -- explicitamente — apagar por omissão faria o fan-out perder
                           -- itens de folha sem ninguém pedir
  active                 boolean not null default true
);

create table contact (                    -- Responsável (recebe o link, envia documentos)
  id            uuid primary key,
  company_id    uuid not null references company(id) on delete cascade,
  name          text not null,
  email         text not null,            -- invariante: sem email não há Solicitação
  phone         text,                     -- habilita WhatsApp
  auth_user_id  uuid references "user"(id) on delete set null
                                          -- nullable (D-04): login do Responsável é opcional,
                                          -- preenchido só se cadastrar no App; upload nunca exige conta
                                          -- SEM unique (2026-09-11): o mesmo user é Responsável
                                          -- por N Empresas — um contact por Empresa; a FK é a junção
);
create index contact_email_idx on contact (email);        -- entrada de /access/recover (rota pública)
create index contact_company_idx on contact (company_id); -- FK não cria índice no Postgres
create index contact_auth_user_idx on contact (auth_user_id); -- caminho do ContactGuard em toda request logada


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
  deleted_at          timestamptz,           -- revogação (equipe): findByToken filtra por ele
  created_by          uuid references accountant(id) on delete set null,
                                             -- autoria (OPS-1): qual contador criou o convite
  constraint invite_has_one_origin check (num_nonnulls(accounting_firm_id, company_id) = 1)
);

create table company_checklist_override ( -- edição leve por Empresa
  id                uuid primary key,
  company_id        uuid not null references company(id) on delete cascade,
  document_type_id  uuid not null references document_type(id),
  action            text not null check (action in ('add','remove')),
  -- campos abaixo exigidos quando action = 'add' (espelham checklist_template_item):
  periodicity       text check (periodicity in ('monthly','annual','on_demand')),
  annual_month      smallint,
  due_day           smallint,
  due_month_offset  smallint,
  condition_flag    text,
  required          boolean,
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
  request_id        uuid not null references request(id) on delete cascade,
  document_type_id  uuid references document_type(id),  -- só p/ relatórios; campos abaixo são cópia
  name              text not null,        -- copiado do document_type na abertura
  description       text,                 -- copiado
  accepted_formats  text[] not null,      -- copiado
  due_date          date,                 -- congelado: reference_month + due_month_offset + due_day;
                                          -- NULL → herda period.due_date → sem prazo
  status            text not null default 'pending'
                      check (status in ('pending','submitted','accepted','rejected')),
  deadline_notified_at timestamptz     -- idempotência do cron de DeadlineMissed: já avisei
                                       -- este Item. Estado em memória reavisaria o cliente
                                       -- a cada restart da API. A reabertura do Item limpa
                                       -- a marca, então prazo que estoura de novo avisa.
);
create index request_item_pending_idx on request_item (request_id, status); -- Painel de Pendências

create table document (                   -- arquivo enviado (1 Item : N Documentos)
  id                uuid primary key,
  request_id        uuid not null references request(id),
  request_item_id   uuid references request_item(id),   -- NULL = Documento Extra
  storage_key       text not null,        -- caminho no R2
  file_name         text not null,
  content_type      text not null,
  size_bytes        bigint not null,      -- na confirmação passa a ser o tamanho REAL do
                                          -- storage, não o declarado pelo cliente
  upload_status     text not null default 'awaiting_upload'
                      check (upload_status in ('awaiting_upload','uploaded')),
                                          -- linha nasce no presign; só a confirmação
                                          -- (que confere o objeto) marca 'uploaded'.
                                          -- Leituras (revisão, zip, painel) exigem
                                          -- 'uploaded'; faxina diária apaga o resto
  uploaded_by_contact_id uuid references contact(id) on delete set null,
                                          -- quem enviou: via Link vem do upload_link,
                                          -- logado vem da sessão (Fase 10)
  uploaded_at       timestamptz,          -- preenchido na confirmação
  review_status     text not null default 'pending'
                      check (review_status in ('pending','accepted','rejected')),
  rejection_reason  text,
  reviewed_by       uuid references accountant(id) on delete set null,
                                          -- autoria da decisão de revisão (OPS-1);
  reviewed_at       timestamptz           -- undo-accept limpa os dois
);
create index document_request_idx on document (request_id);           -- revisão e zip
create index document_request_item_idx on document (request_item_id); -- documentos de um Item

create table upload_link (                -- Link de Upload (token próprio; NÃO é sessão/auth)
  id          uuid primary key,
  request_id  uuid not null references request(id) on delete cascade,
  contact_id  uuid not null references contact(id),
  token_hash  text not null unique,       -- nunca o token em claro
  expires_at  timestamptz not null,
  previous_token_hash text,               -- token anterior (janela de carência na rotação)
  previous_expires_at timestamptz,
  revoked     boolean not null default false
);
create index upload_link_request_idx on upload_link (request_id); -- toda rotação/reenvio busca por aqui
create index upload_link_previous_token_idx on upload_link (previous_token_hash);
```

O token só existe em claro no momento em que é gerado: **rotacionar é a única forma de
voltar a ter um link**. Rotacionam — invalidando o anterior — a reabertura de Item pela
rejeição, o lembrete do cron, o "perdi meu link" do Responsável e o
`POST /requests/:id/upload-link[/resend]` do Contador (copiar / reenviar por email).

### messaging (Comunicação)

```sql
create table message (                    -- log/outbox de tudo que sai
  id          uuid primary key,
  request_id  uuid not null references request(id) on delete cascade,
  channel     text not null check (channel in ('email','whatsapp','push')),
  purpose     text not null check (purpose in
                ('link_delivery','resend','reminder','rejection','deadline_missed','completion')),
  recipient   text not null,
  status      text not null default 'queued'
                check (status in ('queued','sent','delivered','failed')),
  sent_at     timestamptz,
  error       text                          -- motivo da falha do provedor; é o que o
                                            -- Painel de Pendências mostra (MessageFailed)
);
create index message_reminder_idx on message (request_id, purpose);
-- cadência = count(*) where purpose='reminder' por request (sem tabela extra), comparado
-- contra as preferências da Contabilidade (accounting_firm.reminder_* — 2026-09-11).
-- Defaults: máx. 2 por Solicitação; com prazo, lembra a partir de D-3 com gap mínimo de
-- 3 dias; sem prazo, cadência semanal fixa. Regras puras em modules/messaging/reminder-rules.ts.
-- Falha de canal nunca bloqueia o fluxo: vira status='failed' + error e segue.
```

## Consultas/algoritmos canônicos

### Checklist efetivo de uma Empresa (template − removidos + adicionados)

Ponto único de verdade no código: `ChecklistRepository.effectiveChecklist()`
(`apps/api/src/modules/checklists/`), com o merge puro em `effective-checklist.ts`.
Regras que o SQL abaixo não expressa e o merge implementa: um override `add` do
MESMO `document_type` **substitui** a linha do template (edição, não duplicata), e
cada linha volta com `source` (`template` | `override`) e `applies` (resultado de
`condition_flag` contra `company.flags` — a mesma regra do fan-out).

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

### Entrega em zip (rotas do painel — `FirmScope`)

`GET /requests/:id/zip` (uma Empresa numa Competência) e `GET /periods/:id/zip` (a
Competência inteira, uma pasta por Empresa). Streaming: `StorageProvider.openRead` alimenta
o archiver, que escreve direto na resposta — o zip nunca existe inteiro em memória nem em
disco, e cada objeto do storage só é aberto quando chega a vez dele. Sem recompressão
(`store`). Documento com `review_status='rejected'` **fica fora** da entrega (foi recusado
na revisão); Documento Extra vai em `Documentos Extra/`. Montagem dos nomes (sanitização e
colisão) em `modules/requests/zip.ts`.

### Regras de upload (rotas públicas do Link de Upload — `UploadTokenGuard`)

Implementação: `modules/auth/upload-token.guard.ts` (resolve o `upload_link` pelo hash,
valida `expires_at`/`revoked` e injeta `UploadScope`), `modules/requests/upload.controller.ts`
(3 rotas: ver checklist, pedir URLs, confirmar), regras puras em
`modules/requests/file-rules.ts` e storage em `infra/storage/` (ver D12).

- Valida `token_hash` + `expires_at` + `revoked` e injeta `UploadScope` limitado àquela `request`; escopo **só-upload** (a página exibe nomes/status dos itens; NUNCA lista/baixa conteúdo de documentos).
- Upload direto ao R2 via URL pré-assinada (4–6 concorrentes); backend só emite URLs e insere `document`.
- Limites: 100 MB/arquivo; 500 arquivos/envio; teto por Solicitação de 1000 documentos /
  500 MB acumulados (AVAIL-2 — `awaiting_upload` reserva cota até a faxina). Zip aceito
  como formato, **sem extração**.
  O limite é **imposto**, não pedido: o presign assina o tamanho (`ContentLength` no R2,
  HMAC + corte de stream no storage local) e a confirmação confere o objeto real — arquivo
  ausente, maior que o limite ou diferente do declarado é descartado (linha e objeto).
- `request.status = 'closed'` → só aceita Documento Extra (`request_item_id IS NULL`).

## Transições de estado

| Entidade                 | Transições                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request_item.status`    | `pending → submitted` (upload) `→ accepted` \| `rejected` (Revisão); `rejected → pending` (reabertura: **rotaciona o token** do `upload_link` e dispara reenvio SÓ por email — o link anterior morre). Rejeição é por Documento; aceitar o Item aceita todos os Documentos `pending` dele (Documento já `rejected` fica como histórico).                                                                                                   |
| `request.status`         | `open → complete` (todos os itens `accepted`, automático); `open\|complete → closed` (ato do Contador; pode fechar com pendências, com aviso)                                                                                                                                                                                                                                                                                              |
| `period.status`          | `open → closed` (ato do Contador)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `document.upload_status` | `awaiting_upload → uploaded` (confirmação, que confere tamanho real). Nunca volta; envio não confirmado em 24h é apagado pela faxina                                                                                                                                                                                                                                                                                                       |
| `document.review_status` | `pending → accepted` \| `rejected` — Revisão em lote opera no Item (aceita todos os `document` `uploaded` e `pending` do item de uma vez). **Documento Extra** é revisado individualmente (`POST /documents/:id/review-extra`) e não entra na conta de `complete`. **Aceite é desfazível** (`POST /request-items/:id/undo-accept`): Item volta a `submitted`/`pending` e os Documentos aceitos voltam a `pending` — desfazer não é recusar |

### Fase 10 — acesso do Responsável

```sql
create table user_device (               -- Dispositivo acessado por usuário (Contador ou Responsável)
  id           uuid primary key,
  user_id      uuid not null references "user"(id) on delete cascade,
  device_id    text not null,
  platform     text not null check (platform in ('ios', 'android', 'desktop', 'other')),
  installed    boolean not null default false,
  user_agent   text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint user_device_user_device_uidx unique (user_id, device_id)
);
create index user_device_user_id_idx on user_device (user_id);

create table push_subscription (          -- Web Push da PWA do Responsável
  id          uuid primary key,
  contact_id  uuid not null references contact(id) on delete cascade,
  provider    text not null default 'web' check (provider in ('web','fcm')),
  endpoint    text not null,              -- allowlist de host na entrada (contracts/upload.ts):
                                          -- é uma URL que o servidor busca depois, logo SSRF
  keys        jsonb not null,             -- web: {p256dh, auth}; fcm (futuro): token
  unique (contact_id, endpoint)           -- par, não endpoint sozinho (2026-09-11): o mesmo
                                          -- aparelho serve os N contatos de um user multi-empresa,
                                          -- e o upsert não pode roubar a linha de outro contato (AUTHZ-4)
);
```

> **`verification.id` é `text`, não `uuid`.** A tabela é do Better Auth e a biblioteca grava
> ali ids próprios que não são uuid (`reserveVerificationValue`, no fluxo de magic link).
> Quem manda na forma das tabelas de auth é a biblioteca, não a nossa convenção de PK.

> **Coluna nossa em `user` (exceção controlada):** `terms_accepted_at timestamptz` —
> aceite dos Termos/Privacidade (LGPD), carimbado na criação da conta pelos 3 fluxos
> (signup de Contador por convite, aceite de convite do Responsável, ativação pelo Link).
> O Better Auth ignora colunas extras.

## Seed

O conteúdo do seed (tipos de documento e templates fixos MEI / Simples Serviços / Simples Comércio / Lucro Presumido / Lucro Real) está em [`document-catalog.md`](./document-catalog.md). O seed é idempotente: uma parte mínima entra cedo (destrava templates e cadastro de Empresa) e o conteúdo completo depois. Ver [`roadmap.md`](./roadmap.md) para a ordem das fatias.

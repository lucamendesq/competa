# Domínio — Coleta de Documentos Contábeis

> Modelo aprovado pelo fundador em 2026-08-26; refinado em 2026-08-27. Documento vivo.
> Os identificadores em inglês são normativos: use apenas os termos EN registrados no [glossário](#glossário-linguagem-ubíqua-pten) — termo EN fora do mapa é bug de linguagem.

## Subdomínios

| Subdomínio | Classificação | Por quê | Estratégia |
|------------|--------------|---------|------------|
| **Cobrança & Coleta de Documentos** (collection) | **Core** | É onde o produto ganha o jogo: ciclo competência → solicitação → upload sem fricção → revisão → pendências → zip. O diferencial (link sem senha, zip por empresa/mês, painel "quem faltou") mora aqui | Construir com capricho: melhor design, melhores testes |
| **Cadastro** (registry) | Supporting | Necessário (empresas, responsáveis, catálogo, templates, overrides, importação) mas ninguém ganha/perde por isso | CRUD simples e direto, sem cerimônia |
| **Comunicação** (messaging) | Supporting | Entregar mensagens é essencial, mas o trabalho pesado é das APIs (Meta, SES, FCM); nosso valor é orquestrar canais e cadência | Camada fina sobre APIs prontas, ACL por provedor |
| Identidade & Acesso | Generic | Resolvido pelo mercado | Better Auth — configurar, não construir |
| Armazenamento de arquivos | Generic | Resolvido pelo mercado | Cloudflare R2 — integrar |
| Billing do SaaS | Generic | Fora da v1 | Integrar gateway quando chegar a hora |

**Regra prática:** feature no core → modelar com calma, testar invariantes. Feature em supporting → caminho mais curto que funcionar. Coisa generic → a pergunta é sempre "qual serviço integrar", nunca "como construir". Se a classificação mudar, atualize este documento **antes** do código.

## Bounded Contexts

Os 3 contexts são um **mapa conceitual** (vocabulário, invariantes, direção de dependência). A implementação são **feature modules do Nest** — sem fronteiras policiadas nem fachadas. Direção de dependência (convenção): **registry → collection → messaging**, por eventos síncronos via `@nestjs/event-emitter` (a collection emite `RequestCreated`, o messaging escuta com `@OnEvent`) — in-process, sem fila/outbox na v1.

```
┌──────────────────────┐        ┌──────────────────────┐        ┌───────────────────┐
│ registry             │ eventos│ COLLECTION (core)    │ eventos│ messaging         │
│ companies/checklists │ ─────► │ periods/requests     │ ─────► │ providers + cron  │
└──────────┬───────────┘ (sync) └──────────┬───────────┘ (sync) └───┬─────┬─────┬───┘
           │                               │                        ▼     ▼     ▼
     Better Auth (lib,               Cloudflare R2            WhatsApp  Email  FCM
     guards em auth/)              (URL pré-assinada)         Cloud API (SES/Resend)
```

### registry (Cadastro)

**Propósito:** dados mestres — Contabilidade, Empresas, Responsáveis, catálogo de documentos e o que cada tipo de empresa entrega (template + overrides).

**Invariantes (valem independentemente da arquitetura — testar):**
- Contabilidade A NUNCA vê dados da Contabilidade B (sigilo profissional NBC PG 01) — garantido por `FirmScope` nos repositórios.
- Empresa sem email de Responsável não pode receber Solicitação.
- Template do produto (`accounting_firm_id IS NULL`) é imutável; a Contabilidade **deriva** o seu (`derived_from`).
- Checklist efetivo = template − overrides `remove` + overrides `add` — UMA função (`getEffectiveChecklist`); consulta canônica em [`database-schema.md`](./database-schema.md).

**Eventos:** `CompanyRegistered`, `CompanyImported`, `ChecklistDefined`.

### collection (Coleta — CORE)

**Propósito:** o ciclo mensal — abrir a competência, cobrar cada Empresa, receber e revisar documentos, mostrar quem faltou e entregar o zip.

**Invariantes:**
- Uma competência só abre uma vez por Contabilidade (`unique(accounting_firm_id, reference_month)`); pode abrir dentro do próprio mês de referência (itens `due_month_offset = 0`).
- Checklist da Solicitação **congelado na abertura** (snapshot em `request_item` — nome/formatos/due_date copiados).
- Empresa Y NUNCA acessa documento da Empresa X; rotas de upload usam `UploadTokenGuard` → `UploadScope` limitado àquela solicitação, **SÓ escrita** — nunca listam/baixam conteúdo.
- Documento acessível apenas ao Contador da Contabilidade dona e ao Responsável que enviou (LGPD).
- Item aceito só muda via reabertura; rejeição reabre o Item E dispara reenvio de link SÓ por email.
- Encerramento é ato exclusivo do Contador (pode encerrar com pendências 🟡, com aviso); Documento Extra aceito mesmo após encerramento.
- Revisão em lote: aceitar um Item aceita todos os seus Documentos.
- Limites de upload: 100 MB/arquivo, 500/envio; zip armazenado sem extração.

**Eventos:** `PeriodOpened`, `RequestCreated`, `DocumentSubmitted`, `ExtraDocumentSubmitted`, `DocumentAccepted`, `DocumentRejected`, `ItemReopened`, `DeadlineMissed` (por item), `RequestCompleted`, `RequestClosed`, `PeriodClosed`, `ZipGenerated`.

### messaging (Comunicação)

**Propósito:** transformar fatos da collection em mensagens no canal certo — email sempre, WhatsApp quando há telefone, push quando o Responsável tem o App.

**Invariantes:**
- UMA mensagem de lembrete agrupa TODOS os itens pendentes da Solicitação com seus vencimentos; cadência 🔴 máx. 2 por solicitação (contagem em `message`).
- Reenvio de rejeição vai SÓ por email (decisão do fundador).
- Nenhum conteúdo de documento trafega em mensagem (só links, nomes de itens e prazos).
- Template WhatsApp só após aprovação da Meta; falha de WhatsApp degrada para email — **falha de canal NUNCA bloqueia o fluxo** e fica visível ao Contador (`MessageFailed` → painel).
- Cron diário (`reminders.cron.ts`, `@nestjs/schedule`) idempotente.

**Eventos:** `MessageSent`, `ReminderSent`, `MessageFailed`.

## Linha do Tempo de Eventos (jornada principal)

> Nomes PT para leitura; eventos no código em EN (mapa abaixo).

```
Contador                 Sistema                          Responsável
   │                        │                                 │
   ├─ cadastra/importa ───► EmpresaCadastrada                 │
   ├─ escolhe template ───► ChecklistDefinido                 │
   │  (+ overrides)         │                                 │
   ├─ "abrir competência" ► CompetenciaAberta                 │
   │                        ├─ fan-out ► SolicitacaoCriada    │
   │                        │   (checklist efetivo → snapshot │
   │                        │    de Itens com prazos)         │
   │                        ├─ envia link ─────────────────►  │ (email + WhatsApp;
   │                        │                                 │  push se tem App)
   │                        │            DocumentoEnviado ◄── ├─ sobe arquivos
   │                        │            (N arquivos ou zip)  │
   │                        │       DocumentoExtraEnviado ◄── ├─ (opcional, mesmo
   │                        │                                 │   após encerrar)
   ├─ revisa ─┬─ aceita ──► DocumentoAceito (lote por Item)   │
   │          └─ rejeita ─► DocumentoRejeitado                │
   │                        ├─ ItemReaberto                   │
   │                        ├─ reenvia link (só email) ─────► │
   │                        │                                 │
   │                        ├─ agenda ► LembreteEnviado ────► │ (pendências agrupadas)
   │                        ├─ prazo do item? ► PrazoEstourado│ + notifica Contador
   │                        │                                 │
   │                        ├─ tudo aceito ► SolicitacaoCompleta
   ├─ encerra ────────────► SolicitacaoEncerrada (da Empresa) │
   └─ baixa zip ──────────► ZipGerado                         │
```

## Glossário (Linguagem Ubíqua PT↔EN)

Docs, UI e conversas usam **PT-BR**; código e banco usam os equivalentes **EN**. O mapa é **normativo**.

| Termo (PT) | EN (código/banco) | Definição | Contexto | Sinônimos proibidos |
|------------|-------------------|-----------|----------|---------------------|
| **Contabilidade** | `accounting_firm` / `AccountingFirm` | O escritório que paga o SaaS; o tenant. Todo dado pertence a exatamente uma | registry | "cliente"; EN: `client`, `tenant` solto |
| **Contador** | `accountant` / `Accountant` | O usuário da Contabilidade (v1: único por tenant) | registry | "usuário"; EN: `user`, `admin` |
| **Empresa** | `company` / `Company` | Quem envia documentos; cliente da Contabilidade. No MEI, a própria pessoa física | registry | "cliente"; EN: `client`, `customer` |
| **Responsável** | `contact` / `Contact` | Pessoa da Empresa que recebe o link e envia os documentos. Pode se cadastrar (App/push) | registry | "contato" genérico; EN: `responsible`, `user` |
| **Tipo de Empresa** | — (encodado pela escolha do template) | Categoria fiscal (MEI, Simples, Lucro Presumido…). Não há tabela própria | registry | "categoria", "perfil" |
| **Tipo de Documento / Catálogo** | `document_type` / `DocumentType` | Entrada do dicionário ("Extrato bancário"), com formatos aceitos e instrução. Seed em [`document-catalog.md`](./document-catalog.md) | registry | "documento" (é o arquivo enviado); EN: `doc_kind` |
| **Template de Checklist** | `checklist_template` (+ `_item`) | Lista de Tipos de Documento por Tipo de Empresa. Fixo (do produto) ou derivado. Empresa referencia; desvios são Overrides | registry | "modelo", "formulário" |
| **Override de Checklist** | `company_checklist_override` | Ajuste fino por Empresa: adiciona/remove um Tipo de Documento sem tocar o template compartilhado | registry | "exceção", "customização" |
| **Competência** | `period` (col. `reference_month`) | O mês de REFERÊNCIA dos documentos (docs de julho, cobrados em agosto, pertencem à competência 2026-07) | collection | "mês"; EN: `month` solto, `competence` |
| **Abrir a Competência** | `openPeriod()` / `PeriodOpened` | Ação do Contador que gera Solicitações para todas as Empresas ativas (fan-out + snapshot) | collection | "abrir o mês", "disparar" |
| **Solicitação** | `request` / `Request` | O pedido de documentos de UMA Empresa em UMA Competência | collection | "pedido"; EN: `solicitation` |
| **Item** | `request_item` / `RequestItem` | Um documento exigido — snapshot congelado na abertura. Estados: `pending → submitted → accepted \| rejected` (→ reaberto = `pending`) | collection | "tarefa", "campo"; EN: `task` |
| **Documento** | `document` / `Document` | Arquivo enviado pelo Responsável para um Item. Um Item aceita N Documentos | collection | "arquivo" (é o blob); EN: `file` como entidade |
| **Documento Extra** | `document` com `request_item_id IS NULL` | Arquivo opcional fora do checklist; aceito mesmo após a competência encerrada | collection | "anexo"; EN: `attachment` |
| **Revisão** | `review` (col. `review_status`) | Ato do Contador de aceitar/rejeitar. Opera **em lote no Item**. Rejeição reabre o Item e reenvia o link por email | collection | "aprovação", "moderação" |
| **Pendência** | item com `status in ('pending','submitted','rejected')` | Item ainda não aceito. Alimenta o Painel de Pendências ("quem faltou") | collection | "atraso" (atraso implica prazo estourado) |
| **Encerrar a Competência** | `closeRequest()` / `closePeriod()` | Ato manual do Contador — palavra final; pode encerrar com pendências (com aviso) | collection | "finalizar"; "completar" (`complete` é estado automático) |
| **Zip** | `zip` / `ZipGenerated` | Download dos documentos organizados por Empresa/Competência (ou da Competência inteira, 🟡) | collection | "backup", "export" |
| **Link de Upload** | `upload_link` / `UploadLink` | URL sem senha e sem cadastro, escopo SÓ-upload, com expiração. Token próprio — NÃO passa pelo Better Auth | collection | "magic link" (reservado ao login Better Auth), "portal" |
| **Prazo** | `due_date` (item/period) | Vencimento do Item, congelado na abertura; fallback: prazo da Competência; sem ambos: lembrete semanal | collection | "deadline", "vencimento" |
| **Lembrete** | `message` com `purpose='reminder'` | Mensagem automática de cobrança, agrupada por Solicitação. 🔴 cadência default: máx. 2 por solicitação | messaging | "notificação" |
| **App** | app mobile (RN vs Flutter) | App do Responsável cadastrado: push (FCM) + upload pela mesma API. Entra na v1; última do backlog | messaging (canal) | — |
| **Painel de Pendências** | pending panel (view sobre `request_item`) | Visão do Contador: cada Empresa com o que enviou, o que falta e o que está atrasado | collection | "dashboard" (em conversa de negócio) |

### Termos PROIBIDOS em código

| Termo | Em registry/collection | No discurso comercial |
|-------|------------------------|------------------------|
| "cliente" / `client` | **PROIBIDO** — usar Empresa/`company` | A Contabilidade (cliente pagante do SaaS) |
| "usuário" / `user` | **PROIBIDO** — usar Contador/`accountant` ou Responsável/`contact` (exceção: tabela `user` do Better Auth) | Qualquer pessoa logada |
| "mês" / `month` | **PROIBIDO** solto — usar Competência/`period`/`reference_month` | Mês corrente do calendário |

## Eventos de domínio (código EN ↔ PT)

| Evento (código) | PT (docs/conversa) | Emitido por |
|---|---|---|
| `CompanyRegistered`, `CompanyImported`, `ChecklistDefined` | EmpresaCadastrada, EmpresaImportada, ChecklistDefinido | registry |
| `PeriodOpened`, `RequestCreated` | CompetenciaAberta, SolicitacaoCriada | collection |
| `DocumentSubmitted`, `ExtraDocumentSubmitted` | DocumentoEnviado, DocumentoExtraEnviado | collection |
| `DocumentAccepted`, `DocumentRejected`, `ItemReopened` | DocumentoAceito, DocumentoRejeitado, ItemReaberto | collection |
| `DeadlineMissed`, `RequestCompleted`, `RequestClosed`, `PeriodClosed`, `ZipGenerated` | PrazoEstourado, SolicitacaoCompleta, SolicitacaoEncerrada, CompetenciaEncerrada, ZipGerado | collection |
| `MessageSent`, `ReminderSent`, `MessageFailed` | MensagemEnviada, LembreteEnviado, MensagemFalhou | messaging |

**Implementação:** eventos trafegam in-process e síncronos via `@nestjs/event-emitter`; sem fila/outbox na v1.

## Decisões e hipóteses em aberto

| # | Item | Confiança | Default proposto | Como validar |
|---|------|-----------|------------------|--------------|
| 1 | Prazos reais de entrega | 🔴 | Estrutura por item pronta; v1 pode operar só com prazo da competência. Defaults sugeridos em [`document-catalog.md`](./document-catalog.md) §3 | Perguntar ao contador design-partner; observar no concierge |
| 2 | Cadência de lembretes | 🔴 | Máx. 2 lembretes/solicitação + aviso de estouro (~R$0,045/msg WhatsApp); com prazo D-3 e D-0, estouro D+1; sem prazo semanal | Medir entrega após 1º vs. 2º lembrete |
| 3 | Termos "Empresa" e "Responsável" | 🟡 | Empresa = quem envia; Responsável = quem recebe o link | Testar nas conversas de validação; ajustar o glossário |
| 4 | Encerrar competência com pendências | 🟡 | Contador PODE encerrar com itens pendentes (com aviso) | Confirmar caso real com design-partner |
| 5 | Escopo do zip | 🟡 | Por empresa/competência E da competência inteira | Observar qual o design-partner usa |
| 6 | App mobile na v1 / framework | 🟢 escopo / 🔴 framework | App entra na v1 (upload + push). Framework em aberto: RN vs Flutter (Better Auth favorece RN; Flutter adiciona Dart) | Risco: estimativa passa de 4–8 semanas para 3–6 meses. Decidir framework/app nas últimas tasks do backlog |
| 7 | Abrir competência dentro do mês de referência | 🟡 | Permitido (necessário para itens `due_month_offset = 0`, ex.: variáveis de folha) | Validar com design-partner |

# Stitch Prompt — Coleta de Documentos Contábeis

> Paste **Part 0** first (design system), then paste each screen prompt one at a time.
> ALL UI COPY MUST BE IN BRAZILIAN PORTUGUESE (pt-BR). Prompts are in English; rendered text is Portuguese.

---

## PART 0 — GLOBAL BRIEF (paste this first)

I'm designing a **web SaaS for small Brazilian accounting firms (1–5 people)** that automates the monthly collection of accounting documents from their client companies.

**CRITICAL LANGUAGE RULE: every piece of visible copy in every screen — labels, buttons, table headers, empty states, toasts, placeholders, tooltips, dates, currency, validation messages — must be written in Brazilian Portuguese (pt-BR). Never render English text in the UI. Use pt-BR date format (DD/MM/AAAA), month names in Portuguese ("Julho/2026"), and file sizes in MB.**

### Product in one line
The accounting firm defines each client company's monthly document checklist, "opens the competência" (reference month) with one click, and the system emails/WhatsApps every company a **passwordless upload link**. Contacts drop files in the browser, the accountant reviews them in batch, tracks who's missing in a pendency panel, and downloads everything as an organized ZIP.

### Two distinct user experiences (two different visual contexts)
1. **Painel do Contador** — authenticated desktop-first dashboard (data-dense, tables, filters, batch actions). Used daily on a laptop.
2. **Página de Envio** — public, passwordless, **mobile-first** upload page opened from an email/WhatsApp link by a non-technical business owner. Must be radically simple, large touch targets, no jargon, no login, no navigation chrome.

### Domain vocabulary (use these EXACT Portuguese words in the UI — they are the ubiquitous language)
- **Contabilidade** = the accounting firm (the tenant). Never "cliente".
- **Contador** = the firm's user (logged-in person).
- **Empresa** = the client company that sends documents. Never "cliente".
- **Responsável** = the person at the Empresa who receives the link and uploads files.
- **Competência** = the reference month of the documents (e.g. "Competência 07/2026"). Never just "mês".
- **Abrir a Competência** = the action that generates one Solicitação per active Empresa.
- **Solicitação** = the document request for ONE Empresa in ONE Competência.
- **Item** = one required document inside a Solicitação (e.g. "Extrato bancário").
- **Documento** = an uploaded file attached to an Item.
- **Documento Extra** = optional file outside the checklist.
- **Checklist / Template de Checklist / Override** = the list of required document types per company type, and per-company adjustments.
- **Link de Upload** = the passwordless link.
- **Prazo** = due date. **Pendência** = not-yet-accepted item. **Encerrar** = close (final act).
- **Painel de Pendências** = the "quem faltou" (who's missing) view.

### Status vocabulary and colors (consistent everywhere)
- Item: `Pendente` (neutral/gray), `Enviado` (blue/info), `Aceito` (green), `Rejeitado` (red).
- Solicitação: `Aberta` (blue), `Completa` (green), `Encerrada` (gray).
- Competência: `Aberta` (blue), `Encerrada` (gray).
- Deadline overdue → amber/orange "Atrasado" badge with a clock icon.
- Channel failure (email/WhatsApp failed) → red "Falha no envio" badge; the flow is never blocked, it's only surfaced.

### Visual direction
- Modern, calm, professional **fintech/accounting SaaS** look — think Nibo/Linear/Stripe Dashboard, not corporate ERP gray.
- Light theme primary; also produce a dark variant of the dashboard.
- Primary color: a confident deep blue/indigo. Accents: green for accepted, amber for overdue, red for rejected/failure.
- Typography: clean geometric sans (Inter-like). Generous whitespace, 8px spacing grid, subtle 1px borders, rounded-lg cards, very soft shadows. No gradients-as-decoration, no stock photography.
- Dense but breathable data tables with sticky headers, zebra-free rows, hover states, and inline status pills.
- Every list must include a designed **empty state** (illustration/icon + Portuguese sentence + primary action) and a **loading skeleton** variant.
- Mobile-responsive dashboard (tables collapse to cards), and a **truly mobile-first** public upload page.
- Accessibility: minimum 4.5:1 contrast, visible focus rings, status conveyed by icon + text, never color alone.

### Global dashboard layout
Left sidebar (collapsible, 240px) with the firm name at the top and nav in Portuguese:
`Competências` · `Empresas` · `Checklists` · `Mensagens` · `Configurações`.
Top bar: current Competência selector, global search, notification bell, accountant avatar menu (`Meu perfil`, `Convidar contador`, `Sair`).
Main content: page title + breadcrumb + primary action button on the right.

---

## SCREEN PROMPTS (paste one at a time)

### 1. Login (`/entrar`)
Centered card on a soft branded background. Fields `E-mail` and `Senha`, primary button `Entrar`, link `Esqueci minha senha`. Left side (desktop only): product value proposition in Portuguese — headline "Pare de garimpar documento no WhatsApp", 3 bullets: "Abra a competência com 1 clique", "Seu cliente envia sem senha e sem cadastro", "Baixe tudo organizado em zip". Inline error state in Portuguese: "E-mail ou senha inválidos."

### 2. Aceitar convite / Criar conta (`/convite/:token`)
Screen shown when an accountant opens an invitation link. Card showing "Você foi convidado por **[Nome da Contabilidade]**" with the pre-filled, read-only invited e-mail. Fields `Nome completo` and `Senha` (min 8 chars, with strength hint). Button `Criar minha conta`. Also design the expired/invalid state: friendly card "Este convite expirou ou já foi utilizado." with a `Falar com quem te convidou` action.

### 3. Competências — lista (`/competencias`) — HOME after login
Page title `Competências`, primary button `Abrir competência`.
Table with columns: `Competência` (e.g. "Julho/2026"), `Status` (pill Aberta/Encerrada), `Empresas` (count), `Itens pendentes`, `Prazo` (DD/MM/AAAA), `Aberta em`, and a row action menu (`Ver painel`, `Baixar zip da competência`, `Encerrar`).
Above the table, 4 KPI cards: `Competência atual`, `Empresas cobradas`, `Itens pendentes`, `Solicitações completas`.
Empty state: "Nenhuma competência aberta ainda" + button `Abrir a primeira competência`.

### 4. Modal "Abrir Competência"
Modal dialog titled `Abrir competência`.
- Month/year picker field `Mês de referência` (help text: "O mês a que os documentos se referem — normalmente o mês passado.").
- Optional date field `Prazo geral da competência` (help text: "Usado quando o item não tem prazo próprio.").
- A preview block: "Serão criadas **34 solicitações** para as empresas ativas com Responsável cadastrado."
- A warning block (amber) listing companies that will be skipped: "3 empresas ficarão de fora por não terem e-mail do Responsável:" followed by a list with a `Cadastrar Responsável` link each.
- Footer: `Cancelar` (ghost) and `Abrir competência e enviar links` (primary).
Also design the success state after confirming: toast "Competência aberta. 34 links enviados." and a result summary panel listing each Empresa with the state of its message (`Enviado`, `Falhou`).

### 5. Painel de Pendências — "quem faltou" (`/competencias/:id`)
THE most important screen of the product. Header: "Competência Julho/2026" + status pill + actions `Baixar zip da competência`, `Encerrar competência` (destructive-secondary), `Reenviar lembretes`.
Progress bar of overall completion ("68% dos itens aceitos").
Filter chips in Portuguese: `Todas`, `Com pendência`, `Atrasadas`, `Completas`, `Encerradas`, plus a search field `Buscar empresa`.
Main content: one expandable row/card per **Empresa**, showing company name, request status pill, a compact counter group (`Pendente 3 · Enviado 2 · Aceito 7 · Rejeitado 1`), a mini progress bar, and an overdue badge when applicable.
Expanding a company reveals the list of missing Items: item name, status pill, `Prazo 10/08/2026` (in red + "Atrasado" if past due), and quick actions `Revisar`, `Reenviar link`.
If a message failed for that company, show an inline red strip: "Falha no envio por e-mail — o fluxo continua. Reenviar."
Include the empty/zero-pendency celebration state: "Todas as empresas entregaram tudo 🎉" + button `Baixar zip da competência`.

### 6. Revisão da Solicitação (`/solicitacoes/:id`)
Two-column workspace for reviewing one company's submission.
Header: company name, "Competência Julho/2026", status pill, actions `Baixar zip desta empresa`, `Encerrar solicitação`.
Left column: the checklist Items list — each row with item name, status pill, due date, and the number of files ("3 arquivos").
Right column (selected item detail): item name, its instruction text to the Responsável, accepted formats chips (`pdf`, `ofx`, `zip`), due date, and the list of uploaded Documentos as file cards (icon by file type, file name, size in MB, upload date/time, `Baixar` and `Visualizar` actions).
Two clear actions: primary `Aceitar item` (with helper text "Aceitar o item aceita todos os arquivos enviados nele.") and secondary destructive `Rejeitar arquivo`.
Design the **rejection modal**: title `Rejeitar arquivo`, required textarea `Motivo da rejeição` (placeholder: "Ex.: extrato incompleto, faltam os últimos 10 dias do mês"), warning note "O item volta para pendente e um novo link será enviado por e-mail ao Responsável.", buttons `Cancelar` / `Rejeitar e reenviar link`.
Also design a separate section at the bottom: `Documentos extras` — files sent outside the checklist, with a note "Documentos extras não passam por revisão."
And design the close confirmation dialog: "Encerrar a solicitação com 2 itens sem aceite?" with the warning that it's final.

### 7. Empresas — lista (`/empresas`)
Page title `Empresas`, primary button `Nova empresa`, secondary `Importar planilha`.
Table columns: `Empresa`, `CNPJ` (formatted 00.000.000/0000-00), `Responsável` (name + e-mail, with a red "Sem e-mail" badge when missing), `Template de checklist`, `Itens no checklist`, `Status` (Ativa/Inativa toggle pill), row menu (`Editar`, `Checklist`, `Desativar`).
Filters: search field, `Ativas`/`Inativas`/`Todas` segmented control.
Empty state: "Nenhuma empresa cadastrada" + `Cadastrar empresa` + `Importar planilha`.

### 8. Cadastro / Edição de Empresa (`/empresas/nova`)
Form page (or side sheet) with sections:
1. `Dados da empresa` — `Nome`, `CNPJ` (optional, masked).
2. `Tipo de empresa` — a card selector for the checklist template: MEI, Simples Nacional, Lucro Presumido, Lucro Real, Empresa com folha de pagamento. Each card shows the number of documents required.
3. `Características` — toggle switches: `Tem funcionários`, `Aceita pagamento por cartão`, `Controla estoque` (help text: "Definem quais documentos entram no checklist.").
4. `Responsável` — `Nome`, `E-mail` (required, with note "Sem e-mail o Responsável não recebe o link de cobrança."), `WhatsApp` (optional, masked +55 (00) 00000-0000).
5. A right-hand live preview panel titled `Checklist efetivo` listing the resulting required documents grouped by category, with a link `Personalizar checklist desta empresa`.
Footer bar: `Cancelar` / `Salvar empresa`.

### 9. Importar planilha de empresas (`/empresas/importar`)
Step flow. Step 1: drag-and-drop area "Arraste sua planilha (CSV ou XLSX) ou clique para selecionar", with a link `Baixar planilha modelo` and a table showing the expected columns in Portuguese (`nome`, `cnpj`, `responsavel_nome`, `responsavel_email`, `responsavel_telefone`, `template`).
Step 2: the **per-line result report** — a table with `Linha`, `Empresa`, `Resultado` (green "Importada", amber "Ignorada", red "Erro") and `Detalhe` (e.g. "E-mail do responsável inválido"), plus a summary header "28 importadas · 3 com erro · 1 duplicada" and buttons `Corrigir e reenviar` / `Concluir`.

### 10. Checklist da Empresa / Overrides (`/empresas/:id/checklist`)
Screen to fine-tune one company's checklist. Header shows the base template name with a note "Baseado no template Simples Nacional".
A list of document types grouped by category (`Fiscal`, `Financeiro`, `Despesas`, `Folha de pagamento`, `Impostos`, `Societário`), each row with a checkbox/toggle, the document name, its instruction, accepted formats chips, periodicity (`Mensal`, `Anual`, `Sob demanda`) and due day.
Items removed from the template are shown struck-through with an amber `Removido` tag; items added get a blue `Adicionado` tag. A `Restaurar padrão do template` link. Right side: search + `Adicionar documento do catálogo` button opening a searchable catalog picker modal.

### 11. Templates de Checklist (`/checklists`)
List of the 5 product templates (read-only, with a lock icon and tag `Modelo do produto`) and the firm's derived templates (`Meu modelo`, editable). Each card: template name, company type, number of documents, number of companies using it, and actions `Ver`, `Duplicar para editar`.
Detail view of a derived template: editable table of items with columns `Documento`, `Periodicidade`, `Vencimento (dia)`, `Mês de entrega`, `Obrigatório`, `Condição` and an `Adicionar item` button.

### 12. Mensagens (`/mensagens`)
Delivery log. Filters: `Competência`, `Empresa`, `Canal` (E-mail / WhatsApp), `Status` (`Na fila`, `Enviada`, `Entregue`, `Falhou`).
Table: `Data/hora`, `Empresa`, `Responsável`, `Canal` (icon), `Tipo` (`Link inicial`, `Lembrete`, `Reenvio por rejeição`, `Prazo estourado`, `Solicitação completa`), `Status` pill, and a `Reenviar` action on failures.
Highlight a red banner at the top when there are failures: "3 mensagens falharam nesta competência." Include a side panel showing the message preview (subject + body in Portuguese) and the error detail for failures.

### 13. PÁGINA PÚBLICA DE ENVIO (`/envio/:token`) — MOBILE-FIRST, no login, no nav
The single most important screen for the client company's Responsável. Design mobile first (375px), then the desktop version.
- Header: firm logo/name, headline `Envie os documentos de Julho/2026`, subtitle `[Nome da Empresa]`, and a due-date line `Prazo: 10/08/2026` (turns red with "Prazo vencido" when past).
- A progress summary: "3 de 8 documentos enviados" with a progress bar.
- The checklist as **large tappable cards**, one per Item: document name in bold, its plain-language instruction underneath, accepted formats as chips ("Aceita: PDF, OFX"), due date, and a status pill (`Pendente`, `Enviado`, `Aceito`, `Rejeitado`).
- Each card expands to a drop area: "Toque para escolher os arquivos ou arraste aqui" + a `Tirar foto` option on mobile + the list of already-sent files with upload progress bars, per-file success checkmarks, and per-file error rows ("Formato não aceito", "Arquivo maior que 100 MB").
- **Rejected item state**: red-bordered card showing the accountant's reason — "Rejeitado: extrato incompleto, faltam os últimos 10 dias" — and an obvious `Enviar novamente` button.
- Bottom: a secondary section `Enviar documento extra` for files outside the checklist, with the note "Se não estiver na lista acima, envie aqui."
- Sticky bottom bar on mobile with the primary action `Enviar arquivos` and the count of files queued.
- Design these additional states of this same page:
  a) **Tudo enviado**: success screen with a check illustration, "Você enviou todos os documentos de Julho/2026" and "Sua contabilidade vai revisar e avisa se faltar algo.";
  b) **Link expirado**: neutral card "Este link expirou. Peça um novo link para sua contabilidade." (no data leaked, no company details);
  c) **Solicitação encerrada**: "Esta competência foi encerrada. Você ainda pode enviar um documento extra." with only the extra-upload block enabled.
- Absolutely no login, no menu, no listing/downloading of previously uploaded content — this page only writes.

### 14. Confirmação de upload em lote (dentro da página de envio)
A results sheet shown after a multi-file/zip upload: "8 de 10 arquivos enviados", a list with a green check per accepted file and a red row per rejected one with the Portuguese reason ("Formato .docx não aceito neste item", "Máximo de 500 arquivos por envio"), and buttons `Tentar novamente` / `Concluir`.

### 15. Configurações (`/configuracoes`)
Tabs: `Contabilidade` (firm name, logo upload, contact e-mail), `Contadores` (member list + `Convidar contador` modal with the e-mail field and a generated invitation link with a `Copiar link` button), `Lembretes` (toggle `Enviar lembretes automáticos`, cadence explanation "No máximo 2 lembretes por solicitação", channel toggles `E-mail` and `WhatsApp`), `Canais` (WhatsApp connection status card).

### 16. E-mails transacionais (design as email templates, pt-BR)
Design 4 responsive transactional e-mail templates, all copy in Portuguese, firm-branded header, single big CTA button:
1. **Link inicial** — "Documentos de Julho/2026 — [Empresa]", list of the required documents, deadline, button `Enviar meus documentos`.
2. **Lembrete** — "Ainda faltam 4 documentos de Julho/2026", grouped list of pending items with each due date.
3. **Reenvio por rejeição** — "Um documento precisa ser reenviado", showing the item name and the rejection reason, button `Reenviar documento`.
4. **Prazo estourado** — "O prazo de 2 documentos venceu", listing them.

---

## FINAL REMINDERS FOR EVERY SCREEN
- All copy in **Brazilian Portuguese**; dates DD/MM/AAAA; months written out in Portuguese.
- Use the domain vocabulary exactly (Competência, Solicitação, Item, Empresa, Responsável) — never "cliente", never "mês", never "usuário".
- Always deliver: default state, empty state, loading skeleton, and error state.
- Dashboard = desktop-first and data-dense. Upload page = mobile-first and dead simple.

# Plano de Implementação: Novo Design System do Competa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Data:** 18 de outubro de 2026  
**Spec Canônico:** `docs/superpowers/specs/2026-10-18-design-system-design.md`  
**Status Tracker:** `.superpowers/STATUS-design-system.md`  
**App Alvo:** `apps/web` (Vue 3 + Vite + Tailwind 4 + Reka UI + Pinia)  
**Regras Cruciais:**

- Puramente visual (zero quebras de regra, chamadas de API, rotas, validações ou textos).
- Proibição absoluta de motivos losango ou quadrados girados 45° (`rotate-45`).
- Commits na `main` em Conventional Commits pt-BR (sem trailers de coautoria).
- Execução estritamente sequencial com um subagente escritor por vez + revisão independente após cada tarefa.

---

## Mapeamento de Arquivos por Tarefa

### Tarefa 1: Fundação & Tokens

- **Criar/Instalar:** `@fontsource-variable/outfit`, `@fontsource-variable/plus-jakarta-sans`
- **Modificar:** `apps/web/src/main.css` (redefinir tokens `@theme`, `:root`, descontinuar `:root.dark`)
- **Modificar:** `apps/web/src/components/ui/tooltip/TooltipContent.vue` (remover `rotate-45`)
- **Modificar:** `apps/web/src/components/ui/button/index.ts` (variantes de botão)
- **Modificar:** `apps/web/src/components/StatusPill.vue` (cores semânticas da nova paleta)
- **Modificar:** `apps/web/src/components/Logo.vue` e `apps/web/public/brand/*.svg` (novos SVGs sem 45°)
- **Criar:** `apps/web/scripts/check-no-diamond.ts` (teste automatizado anti-losango)

### Tarefa 2: Shell & Navegação

- **Modificar:** `apps/web/src/layouts/PanelLayout.vue` (sidebar branca, bordas sutis, nav em pílulas, remoção do dark mode toggle)

### Tarefa 3: Autenticação & Área Pública de Upload

- **Modificar:** `apps/web/src/pages/LoginPage.vue`, `apps/web/src/pages/RegisterPage.vue` (coluna hero em `#0F172A`)
- **Modificar:** `apps/web/src/pages/ForgotPasswordPage.vue`, `apps/web/src/pages/ResetPasswordPage.vue`, `apps/web/src/pages/InvitePage.vue`
- **Modificar:** `apps/web/src/pages/UploadPage.vue`, `apps/web/src/components/UploadFeedback.vue`, `apps/web/src/components/ResendNotice.vue`
- **Modificar:** `apps/web/src/pages/RecoverLinkPage.vue`, `apps/web/src/pages/RecoverLinkConfirmPage.vue`, `apps/web/src/pages/TermsPage.vue`, `apps/web/src/pages/PrivacyPage.vue`

### Tarefa 4: Telas Centrais do Contador

- **Modificar:** `apps/web/src/pages/PeriodsListPage.vue` (lista e modal de abertura)
- **Modificar:** `apps/web/src/pages/PendingPanelPage.vue` (painel "quem faltou")
- **Modificar:** `apps/web/src/pages/RequestReviewPage.vue` (revisão de solicitações)

### Tarefa 5: Telas de Cadastro & Suporte

- **Modificar:** `apps/web/src/pages/CompaniesListPage.vue`, `apps/web/src/pages/CompanyFormPage.vue`, `apps/web/src/pages/CompanyChecklistPage.vue`, `apps/web/src/pages/ImportCompaniesPage.vue`
- **Modificar:** `apps/web/src/pages/ChecklistsListPage.vue`, `apps/web/src/pages/ChecklistFormPage.vue`

### Tarefa 6: Configurações & Área do Responsável

- **Modificar:** `apps/web/src/pages/FirmSettingsPage.vue`, `apps/web/src/pages/AccountantsSettingsPage.vue`, `apps/web/src/pages/PlanPage.vue`, `apps/web/src/pages/WhatsAppSettingsPage.vue`
- **Modificar:** `apps/web/src/layouts/ContactLayout.vue` (header Noite Azulada, remoção do dark toggle)
- **Modificar:** `apps/web/src/pages/ContactPendingPage.vue`, `apps/web/src/pages/ContactSignInPage.vue`, `apps/web/src/pages/ContactSetPasswordPage.vue`, `apps/web/src/pages/ContactHistoryPage.vue`
- **Deletar:** `apps/web/src/composables/useTheme.ts` (código morto após remoção do toggle)

### Tarefa 7: Limpeza & Verificação Final

- **Modificar:** `apps/web/src/main.css` (revisão de CSS não utilizado)
- **Criar/Rodar:** `apps/web/scripts/check-wcag-contrast.ts` (script validador de contrastes)
- **Verificar:** `pnpm --filter web build` e `pnpm check:api-error`

---

## Tarefa 1: Fundação & Tokens

### Objetivo

Estabelecer as bases do novo design system: instalar tipografia Outfit e Plus Jakarta Sans, configurar os tokens semânticos no Tailwind 4 via aliasing no `main.css`, eliminar resquícios de dark mode nas variáveis, sanitizar o tooltip (`rotate-45`), criar o teste automatizado anti-losango e atualizar o componente `Logo.vue`.

### Passos Detalhados

- [x] **Passo 1.1:** Instalar `@fontsource-variable/outfit` e `@fontsource-variable/plus-jakarta-sans` em `apps/web`.
  - Comando: `pnpm --filter web add @fontsource-variable/outfit @fontsource-variable/plus-jakarta-sans`
  - Importar as fontes no topo de `apps/web/src/main.ts` ou `main.css`.
- [x] **Passo 1.2:** Criar o script de teste anti-losango `apps/web/scripts/check-no-diamond.ts`.
  - O script varre todos os arquivos `.vue`, `.ts`, `.css` de `apps/web/src` procurando `rotate-45`, `rotate(45`, `rotate-[-45`, `diamond`. Falha se encontrar qualquer ocorrência.
  - Executar: `npx tsx apps/web/scripts/check-no-diamond.ts` (deve falhar inicialmente apontando `TooltipContent.vue`).
- [x] **Passo 1.3:** Atualizar `apps/web/src/components/ui/tooltip/TooltipContent.vue`.
  - Remover a classe `rotate-45` da seta ou substituir por triângulo SVG/borda limpa sem rotação 45°.
  - Reexecutar `npx tsx apps/web/scripts/check-no-diamond.ts` (deve passar verde).
- [x] **Passo 1.4:** Atualizar `apps/web/src/main.css` com a nova paleta.
  - Definir `--font-sans: 'Plus Jakarta Sans Variable', ...` e `--font-display: 'Outfit Variable', ...`.
  - Mapear os tokens no `@theme`:
    - `--color-canvas: #FAFAFA`
    - `--color-surface: #FFFFFF`
    - `--color-sunken: #F1F5F9`
    - `--color-anchor: #0F172A`
    - `--color-brand: #D97706`
    - `--color-brand-strong: #B45309`
    - `--color-brand-light: #FEF3C7`
  - Aliasing no `:root`:
    - `--background: #FAFAFA`
    - `--foreground: #0F172A`
    - `--card: #FFFFFF`
    - `--card-foreground: #0F172A`
    - `--primary: #B45309`
    - `--primary-foreground: #FFFFFF`
    - `--sidebar: #FFFFFF`
    - `--sidebar-foreground: #0F172A`
    - `--sidebar-accent: #FEF3C7`
    - `--sidebar-accent-foreground: #B45309`
    - `--border: #E2E8F0`
    - `--ring: #D97706`
  - Remover a declaração `:root.dark` e seus overrides.
- [x] **Passo 1.5:** Atualizar os primitivos de UI em `apps/web/src/components/ui/`:
  - `button/index.ts`: garantir que `default` use `bg-primary text-primary-foreground hover:bg-primary/90` e estados de foco usem anel âmbar.
  - `StatusPill.vue`: garantir que os tons `success`, `warning`, `info`, `danger` e `neutral` usem as novas cores semânticas especificadas.
- [x] **Passo 1.6:** Atualizar `apps/web/src/components/Logo.vue` e gerar os novos SVGs da marca em `apps/web/public/brand/` com isotipo em Âmbar e tipografia Outfit, sem 45°.
- [x] **Passo 1.7:** Adicionar `"check:no-diamond": "tsx scripts/check-no-diamond.ts"` ao `package.json` de `apps/web`.
- [x] **Passo 1.8:** Verificação de integridade:
  - `pnpm --filter web run check:no-diamond`
  - `pnpm --filter web run check:api-error`
  - `pnpm --filter web build`
- [ ] **Passo 1.9:** Commit: `feat: fundacao e tokens do novo design system competa`

---

## Tarefa 2: Shell & Navegação

### Objetivo

Redesenhar o layout do painel interno do contador (`PanelLayout.vue`) aplicando o conceito claro e arejado: sidebar branca pura com linhas divisórias leves, navegação em pílulas com highlight em âmbar suave (`#FEF3C7`), remoção do seletor de dark mode do menu de perfil e header mobile refinado.

### Passos Detalhados

- [x] **Passo 2.1:** Atualizar `apps/web/src/layouts/PanelLayout.vue`.
  - Sidebar: alterar de `bg-sidebar` escuro para fundo branco puro (`bg-surface border-r border-border-subtle`).
  - Navegação: links com pílula arredondada, texto `#475569`, estado ativo com `bg-brand-light text-brand-strong font-semibold`.
  - Cabeçalho da sidebar: exibir o novo logo em tom normal (não dark surface).
  - Menu de perfil: remover o botão de alternar tema (Sun/Moon e `theme.toggle`), mantendo "Convidar contador" e "Sair".
  - Header mobile: fundo branco limpo com borda inferior sutil e botão de menu acessível.
- [x] **Passo 2.2:** Verificação de integridade:
  - `pnpm --filter web run check:no-diamond`
  - `pnpm --filter web build`
- [ ] **Passo 2.3:** Commit: `feat: shell clara e arejada do painel do contador`

---

## Tarefa 3: Autenticação & Área Pública de Upload

### Objetivo

Garantir que a experiência de entrada e a página pública de upload (mobile-first 375px) transmitam a nova identidade com contraste e simplicidade impecáveis: telas de login/cadastro com coluna institucional em Noite Azulada (`#0F172A`) e a página de upload acolhedora, clara e sem atrito.

### Passos Detalhados

- [ ] **Passo 3.1:** Redesenhar telas de login e cadastro:
  - `apps/web/src/pages/LoginPage.vue`: coluna esquerda com `bg-[#0F172A] text-white`, logo branco da nova marca e benefícios com ícones em destaque. Coluna direita com formulário limpo, inputs com anel de foco âmbar e botão primário em Âmbar Encorpado (`#B45309`).
  - `apps/web/src/pages/RegisterPage.vue`: mesmo alinhamento visual da coluna institucional em Noite Azulada.
  - `ForgotPasswordPage.vue`, `ResetPasswordPage.vue`, `InvitePage.vue`: cards centralizados sobre canvas `#FAFAFA`, logo centralizado e botões primários consistentes.
- [ ] **Passo 3.2:** Redesenhar a página pública de upload:
  - `apps/web/src/pages/UploadPage.vue`:
    - Topo institucional em Noite Azulada (`#0F172A`) ou branco limpo com identificação nítida da contabilidade e competência.
    - Card de progresso circular com o tom âmbar da marca.
    - Cards de itens de documentos:
      - Pendente: borda âmbar suave (`border-amber-200 bg-amber-50/40`), botão de ação rápido em destaque.
      - Entregue: badge verde esmeralda com listagem dos arquivos enviados.
      - Rejeitado: caixa de alerta contextualizada com o aviso de reenvio.
  - `apps/web/src/components/UploadFeedback.vue` e `apps/web/src/components/ResendNotice.vue`: alinhamento com a nova paleta de status.
  - `RecoverLinkPage.vue`, `RecoverLinkConfirmPage.vue`, `TermsPage.vue`, `PrivacyPage.vue`: páginas com tipografia refinada e cards claros.
- [ ] **Passo 3.3:** Verificação mobile:
  - Testar que a `UploadPage` não gera overflow horizontal em 375px.
- [ ] **Passo 3.4:** Verificação de integridade:
  - `pnpm --filter web run check:no-diamond`
  - `pnpm --filter web build`
- [ ] **Passo 3.5:** Commit: `feat: visual das telas de autenticacao e pagina publica de upload`

---

## Tarefa 4: Telas Centrais do Contador

### Objetivo

Redesenhar as telas onde o contador passa a maior parte do tempo: a listagem de competências, o painel "quem faltou" (`PendingPanelPage.vue`) e a tela de revisão de solicitações (`RequestReviewPage.vue`).

### Passos Detalhados

- [x] **Passo 4.1:** Redesenhar `apps/web/src/pages/PeriodsListPage.vue`:
  - Cards de KPI com tipografia Outfit nos grandes números e labels claras.
  - Tabela/lista de competências com badges de status padronizados e botão de "Abrir Competência" em destaque.
  - Modal de abertura de competência limpo e responsivo.
- [x] **Passo 4.2:** Redesenhar `apps/web/src/pages/PendingPanelPage.vue`:
  - Barra de progresso geral em Âmbar Solar (`#D97706`).
  - Chips de filtro de status em pílulas com contadores arredondados.
  - Lista sanfonada de empresas com cards brancos sobre canvas `#FAFAFA`, separadores sutis, badge de atraso sem losangos e botões de ação alinhados.
  - Seção expandida de falhas de notificação e itens pendentes com superfícies de status limpas.
- [x] **Passo 4.3:** Redesenhar `apps/web/src/pages/RequestReviewPage.vue`:
  - Lista de documentos submetidos com ações de aceite em lote e rejeição com justificativa.
  - Modais de rejeição e visualização de arquivos limpos e sem quebra visual.
- [x] **Passo 4.4:** Verificação de integridade:
  - `pnpm --filter web run check:no-diamond`
  - `pnpm --filter web build`
- [ ] **Passo 4.5:** Commit: `feat: visual das telas de competencias, pendencias e revisao`

---

## Tarefa 5: Telas de Cadastro & Suporte

### Objetivo

Redesenhar as páginas de gestão de Empresas e Checklists/Templates, garantindo harmonia visual e facilidade no preenchimento de formulários densos.

### Passos Detalhados

- [x] **Passo 5.1:** Redesenhar telas de Empresas:
  - `CompaniesListPage.vue`: tabela clara de empresas com chips de busca, paginação e botão "+ Nova Empresa".
  - `CompanyFormPage.vue`: formulário de dados da empresa com inputs padronizados e seletor de template.
  - `CompanyChecklistPage.vue`: personalização de overrides com itens claros e botões de ação.
  - `ImportCompaniesPage.vue`: área de drag-and-drop de planilha (.xlsx/.csv) e tabela de prévia.
- [x] **Passo 5.2:** Redesenhar telas de Checklists:
  - `ChecklistsListPage.vue`: listagem de templates com cards e tags de categorias.
  - `ChecklistFormPage.vue`: editor de checklist com adição de itens e formatos permitidos.
- [x] **Passo 5.3:** Verificação de integridade:
  - `pnpm --filter web run check:no-diamond`
  - `pnpm --filter web build`
- [ ] **Passo 5.4:** Commit: `feat: visual das telas de empresas e checklists`

---

## Tarefa 6: Configurações & Área do Responsável

### Objetivo

Redesenhar a área de configurações do escritório, a área logada do responsável e remover o composable órfão `useTheme.ts`.

### Passos Detalhados

- [x] **Passo 6.1:** Redesenhar telas de Configurações:
  - `FirmSettingsPage.vue`: dados da contabilidade e logo.
  - `AccountantsSettingsPage.vue`: gestão de equipe e convites.
  - `PlanPage.vue`: visual de planos, uso da competência e status da assinatura.
  - `WhatsAppSettingsPage.vue`: tela de status de integração do canal.
- [x] **Passo 6.2:** Redesenhar o layout e telas da Área do Responsável:
  - `apps/web/src/layouts/ContactLayout.vue`: topo institucional em Noite Azulada (`#0F172A`), remoção do botão de alternar tema e navegação mobile no rodapé limpa.
  - `ContactPendingPage.vue`: lista "O que falta" para o responsável com cards claros.
  - `ContactSignInPage.vue` e `ContactSetPasswordPage.vue`: telas de acesso com senha limpas.
  - `ContactHistoryPage.vue`: histórico de competências.
- [x] **Passo 6.3:** Remover `apps/web/src/composables/useTheme.ts` e qualquer importação residual.
- [x] **Passo 6.4:** Verificação de integridade:
  - `pnpm --filter web run check:no-diamond`
  - `pnpm --filter web build`
- [ ] **Passo 6.5:** Commit: `feat: visual de configuracoes e area do responsavel com limpeza de dark mode`

---

## Tarefa 7: Limpeza & Verificação Final

### Objetivo

Realizar a faxina de código residual, executar auditoria de contraste WCAG AA por script automatizado, testar responsividade em 375px e validar a linha de base de build.

### Passos Detalhados

- [ ] **Passo 7.1:** Criar e executar `apps/web/scripts/check-wcag-contrast.ts`:
  - Valida as combinações principais de cor do design system:
    - Texto `#0F172A` sobre `#FAFAFA` (≥ 4,5:1)
    - Texto `#0F172A` sobre `#FFFFFF` (≥ 4,5:1)
    - Texto `#FFFFFF` sobre botão `#B45309` (≥ 4,5:1)
    - Anel de foco `#D97706` sobre `#FFFFFF` (≥ 3:1)
    - Status badges (verde, âmbar, vermelho, azul) com texto sobre superfície (≥ 4,5:1)
  - Adicionar `"check:wcag": "tsx scripts/check-wcag-contrast.ts"` ao `package.json`.
- [ ] **Passo 7.2:** Faxina de código morto e classes antigas:
  - Garantir que nenhum import órfão ou classe legada permaneça no `main.css`.
- [ ] **Passo 7.3:** Verificação completa de integridade:
  - `pnpm --filter web run check:no-diamond`
  - `pnpm --filter web run check:wcag`
  - `pnpm --filter web run check:api-error`
  - `pnpm --filter web build`
- [ ] **Passo 7.4:** Atualização da documentação:
  - Atualizar `docs/frontend-status.md` com a confirmação da nova identidade visual.
  - Atualizar `.superpowers/STATUS-design-system.md` marcando 100% de conclusão.
- [ ] **Passo 7.5:** Commit: `chore: limpeza final e auditoria de contraste do design system`

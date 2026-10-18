# Spec de Design: Novo Design System do Competa

**Data:** 18 de outubro de 2026  
**Status:** Aprovado  
**App Alvo:** `apps/web` (Vue 3 + Vite + Tailwind 4 + Reka UI + Pinia)  
**Repositório:** `~/github.com/pygmus-labs/competa`

---

## 1. Contexto e Motivação

O **Competa** é um SaaS B2B que elimina o garimpo manual de documentos contábeis entre escritórios contábeis (pequenas firmas de 1 a 5 pessoas) e as empresas clientes. O sistema gerencia o checklist mensal por empresa, abre a competência, cobra automaticamente por WhatsApp/e-mail, recebe os arquivos por link sem senha (mobile-first), monitora pendências no painel "quem faltou" e entrega tudo organizado em zip por empresa e competência.

Atualmente, o frontend (`apps/web`) utiliza uma interface herdada de boilerplates genéricos:

- Azul Royal padrão (`#2563EB`) sem personalidade proprietária.
- Barra lateral escura e pesada (`oklch(0.208 0.04 265.75)`), que cansa em uso prolongado e lembra painéis de infraestrutura/servidores (estilo Grafana/Docker).
- Fundo branco plano sobre cards brancos, sem camadas de profundidade ou respiro visual.
- Tipografia Inter genérica em todo o app.

Este spec define o **redesenho puramente visual** do `apps/web` com um design system próprio, acolhedor e ágil, com foco em ergonomia para o contador e simplicidade extrema para o cliente que sobe os documentos no celular.

---

## 2. Invariantes Rígidas (Non-Negotiables)

1. **Puramente Visual:** Em hipótese alguma a aplicação pode quebrar ou alterar comportamentos.
   - Não mudam: rotas, fluxos de navegação, chamadas de API, stores Pinia, schemas Zod (`libs/contracts`), validações nem regras de negócio.
   - Não mudam: textos de tela, mensagens de erro, placeholders nem `aria-labels`.
   - Não mudam: migrations de banco de dados nem endpoints do backend NestJS (`apps/api`).
2. **Proibição de Losangos / Elementos Girados 45°:**
   - É estritamente proibido qualquer motivo de losango ou quadrado girado a 45° (decoração, marcador, seta, ícone ou container).
   - Um teste automatizado específico deve varrer o código de `apps/web` e falhar se encontrar `rotate-45`, `rotate(45`, `diamond`, etc. A seta de tooltip em `TooltipContent.vue` que usava `rotate-45` será substituída por estilo limpo sem rotação 45°.
3. **Acessibilidade WCAG AA:**
   - Todo texto de corpo e interface deve ter contraste ≥ 4,5:1 em relação ao fundo.
   - Indicadores de foco (`focus-visible`) e elementos interativos essenciais devem ter contraste ≥ 3:1.
4. **Responsividade Mobile Rígida:**
   - Nenhuma tela ou modal pode apresentar rolagem horizontal em 375px.
   - Modais, gavetas e menus devem se ajustar confortavelmente em telas pequenas sem corte de conteúdo.
5. **Foco 100% no Tema Claro (Light Mode Exclusivo):**
   - Decisão aprovada: o tema escuro será descontinuado para simplificar a arquitetura e otimizar a ergonomia de leitura de documentos fiscais (que possuem fundo branco). Remove-se `useTheme.ts`, os alternadores de tema nos menus de perfil e a declaração `:root.dark`.
6. **Critério de Qualidade da Linha de Base:**
   - O trabalho é feito na branch `main` local, com commits em Conventional Commits pt-BR (sem coautoria).
   - Critério de cada etapa: `pnpm --filter web build` (que roda `vue-tsc -b && vite build`) e testes mantidos verdes (não piorar a linha de base).

---

## 3. Identidade Visual & Sistema de Tokens

### 3.1. Direção de Cor: Noite Azulada & Âmbar Solar

- **Âncora Estrutural (Noite Azulada):**
  - `--color-anchor`: `#0F172A` (Slate 900)
  - Utilizado em cabeçalhos institucionais, texto primário e elementos de alto contraste.
- **Cor da Marca & Ações Principais (Âmbar Solar):**
  - `--color-brand`: `#D97706` (Amber 600) — Tom vibrante para ícones, destaques da marca e estados ativos.
  - `--color-brand-strong`: `#B45309` (Amber 700) — Tom encorpado para botões primários com texto branco, garantindo contraste WCAG AA de 4,7:1.
  - `--color-brand-light`: `#FEF3C7` (Amber 100) — Superfície sutil para seleção ativa de menus e chips.
  - `--color-brand-contrast`: `#FFFFFF` — Cor de texto sobre o botão primário.
- **Superfícies & Profundidade (Canvas-First):**
  - `--color-canvas`: `#FAFAFA` — Fundo geral da aplicação (respiro visual).
  - `--color-surface`: `#FFFFFF` — Superfície dos cards, modais e popovers.
  - `--color-surface-sunken`: `#F1F5F9` — Cabeçalhos de tabelas, seções secundárias e áreas expandidas.
  - `--color-border-subtle`: `#E2E8F0` — Linhas divisórias leves.
  - `--color-border-strong`: `#CBD5E1` — Bordas de inputs e caixas interativas.
  - `--color-ring-focus`: `#D97706` — Anel de foco com 2px de offset.
- **Status Semânticos Funcionais:**
  - **Sucesso / Concluído (Esmeralda):**
    - Superfície: `#F0FDF4` | Borda: `#BBF7D0` | Texto/Ícone: `#15803D`
    - Aplicação: "Zero pendências", "Item aceito", "Solicitação concluída".
  - **Pendente / Atrasado (Âmbar Ocre):**
    - Superfície: `#FFF7ED` | Borda: `#FED7AA` | Texto/Ícone: `#C2410C`
    - Aplicação: "Documentos pendentes", "Prazo estourado", "Aguardando cliente".
  - **Em Revisão / Informativo (Azul Céu):**
    - Superfície: `#EFF6FF` | Borda: `#BFDBFE` | Texto/Ícone: `#1D4ED8`
    - Aplicação: "Arquivos enviados aguardando conferência", avisos de sistema.
  - **Rejeitado / Perigo (Carmim / Vermelho):**
    - Superfície: `#FEF2F2` | Borda: `#FECACA` | Texto/Ícone: `#B91C1C`
    - Aplicação: "Item devolvido com correção", falhas de entrega de WhatsApp.

### 3.2. Estratégia de Arquitetura de Tokens (Aliasing Semântico)

Para garantir **zero regressão** nos 35 componentes de UI do shadcn-vue / Reka UI (`components/ui/`), a nova taxonomia será mapeada via aliasing CSS direto no `@theme` e `:root` do `apps/web/src/main.css`:

- `--background: var(--color-canvas);`
- `--foreground: var(--color-anchor);`
- `--card: var(--color-surface);`
- `--card-foreground: var(--color-anchor);`
- `--primary: var(--color-brand-strong);`
- `--primary-foreground: var(--color-brand-contrast);`
- `--sidebar: var(--color-surface);` (fundo branco puro no painel)
- `--sidebar-foreground: var(--color-anchor);`
- `--sidebar-accent: var(--color-brand-light);`
- `--sidebar-accent-foreground: var(--color-brand-strong);`
- `--sidebar-border: var(--color-border-subtle);`
- `--border: var(--color-border-subtle);`
- `--ring: var(--color-ring-focus);`

### 3.3. Tipografia

Instalação e uso via pacotes modernos `@fontsource-variable`:

- **Display / Títulos / KPIs:** `Outfit Variable` (`--font-display`).
  - Expressiva, geométrica, contemporânea. Traz autoridade e ritmo para os números grandes da competência.
- **Corpo / Tabelas / Controles:** `Plus Jakarta Sans Variable` (`--font-sans`).
  - Excelente legibilidade em dados fiscais densos, CNPJs, datas e botões.

### 3.4. Raios de Borda e Sombras

- Raios de borda:
  - `radius-sm`: `6px` (badges, tags, botões pequenos)
  - `radius-md`: `8px` (inputs, botões regulares, selects)
  - `radius-lg`: `12px` (cards de dados, listas agrupadas)
  - `radius-xl`: `16px` (modais, painéis flutuantes, container mobile)
  - `radius-pill`: `9999px` (pílulas de status e filtros)
- Sombras:
  - `shadow-xs`: `0 1px 2px rgba(15, 23, 42, 0.04)`
  - `shadow-sm`: `0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)`
  - `shadow-md`: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`
  - `shadow-lg`: `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)`

---

## 4. Arquitetura de Componentes e Telas

### 4.1. Shell do Painel do Contador (`apps/web/src/layouts/PanelLayout.vue`)

- Barra lateral clara em branco puro (`#FFFFFF`) com borda sutil à direita (`#E2E8F0`).
- Itens de navegação em pílulas confortáveis (`h-10 px-3`), com estado ativo em âmbar sutil (`bg-[#FEF3C7] text-[#92400E] font-semibold`).
- Logo redesenhado do Competa com isotipo em Âmbar Solar e tipografia Outfit, sem elementos em 45°.
- Topbar mobile limpa, com botão de menu e identificação da contabilidade.
- Menu de perfil no rodapé da sidebar com iniciais arredondadas e popover claro (sem alternador de tema escuro).

### 4.2. Telas de Autenticação & Layout do Contato

- `LoginPage.vue` e `RegisterPage.vue`: A coluna esquerda de apresentação usará explicitamente o fundo Noite Azulada (`bg-[#0F172A] text-white`) com destaque do logo branco, preservando o impacto editorial da entrada sem depender da variável `--sidebar` do painel.
- `ContactLayout.vue`: Header institucional em Noite Azulada (`#0F172A`) com navegação clara no rodapé móvel.

### 4.3. Página Pública de Envio (`apps/web/src/pages/UploadPage.vue`)

- Mobile-first nativo (375px até desktop).
- Topo institucional limpo em Noite Azulada com o nome do escritório contábil e a competência de referência.
- Cards dos itens do checklist com clara distinção entre:
  - Itens pendentes: destaque em borda âmbar suave e botão de ação rápido ("Tirar foto ou anexar").
  - Itens entregues: feedback verde esmeralda com indicação dos arquivos submetidos.
  - Itens rejeitados: caixa de aviso contextualizada com motivo da rejeição preenchido pelo contador.
- Modal de definição de senha simples e sem layout shift no mobile.

### 4.4. Telas de Competências e Pendências (`PendingPanelPage.vue` & `PeriodsListPage.vue`)

- Barra de progresso circular e linear da competência com o Âmbar Solar da marca.
- Barra de busca e chips de filtro por status ("Todos", "Pendentes", "Atrasadas", "Completas", "Encerradas") em pílulas com contadores.
- Lista de empresas em cards brancos sanfonados com separador sutil, badge de atraso sem losango e ações à direita alinhadas verticalmente ("Conferir", "Copiar link", ".zip").

### 4.5. Telas de Empresas, Checklists e Configurações

- Listas tabulares sobre superfície rebaixada, com tipografia legível e contrastes nítidos.
- Formulários com inputs padronizados (`h-10`, bordas suaves, anel de foco âmbar).
- Modais e gavetas com fundo escurecido sutil e animação suave de entrada.

---

## 5. Estratégia de Execução & Tarefas

A implementação seguirá 7 tarefas pequenas e autocontidas:

1. **Tarefa 1: Fundação & Tokens:**
   - Instalação de `@fontsource-variable/outfit` e `@fontsource-variable/plus-jakarta-sans`.
   - Atualização do `main.css` com a nova escala de cores, tipografia, raios e sombras em Tailwind 4 via aliasing semântico (limpeza de `:root.dark`).
   - Atualização dos primitivos de UI em `components/ui/` (Button, Input, Badge, StatusPill, TooltipContent sem rotate-45).
   - Teste automatizado contra uso de losangos (`rotate-45`).
   - Atualização do componente `Logo.vue` e novos SVGs da marca em `public/brand/` (sem 45°).
2. **Tarefa 2: Shell & Navegação:**
   - Redesenho do `PanelLayout.vue` para a shell clara e arejada.
   - Remoção do alternador de tema escuro e simplificação do menu de perfil.
   - Refinamento do menu mobile.
3. **Tarefa 3: Autenticação & Área Pública de Upload:**
   - Redesenho de `LoginPage.vue`, `RegisterPage.vue`, `ForgotPasswordPage.vue`, `ResetPasswordPage.vue`, `InvitePage.vue`.
   - Redesenho de `UploadPage.vue`, `UploadFeedback.vue`, `ResendNotice.vue`.
   - Páginas acessórias: `RecoverLinkPage.vue`, `RecoverLinkConfirmPage.vue`, termos e privacidade.
4. **Tarefa 4: Telas Centrais do Contador:**
   - `PeriodsListPage.vue` (lista de competências e modal de abertura).
   - `PendingPanelPage.vue` (painel "quem faltou").
   - `RequestReviewPage.vue` (revisão de solicitações e aceite em lote).
5. **Tarefa 5: Telas de Cadastro & Suporte:**
   - `CompaniesListPage.vue`, `CompanyFormPage.vue`, `CompanyChecklistPage.vue`, `ImportCompaniesPage.vue`.
   - `ChecklistsListPage.vue`, `ChecklistFormPage.vue`.
6. **Tarefa 6: Configurações & Área do Responsável:**
   - `FirmSettingsPage.vue`, `AccountantsSettingsPage.vue`, `PlanPage.vue`, `WhatsAppSettingsPage.vue`.
   - `ContactLayout.vue`, `ContactPendingPage.vue`, `ContactSignInPage.vue`, `ContactSetPasswordPage.vue`, `ContactHistoryPage.vue`.
   - Remoção de `useTheme.ts` após descontinuação do alternador.
7. **Tarefa 7: Limpeza & Verificação Final:**
   - Remoção de CSS morto e tokens legados.
   - Auditoria automatizada de acessibilidade WCAG (script de contraste).
   - Verificação completa de build e tipos (`pnpm --filter web build`).

---

## 6. Decisões do Construtor Registradas

- **Descontinuação do Dark Mode:** Foco exclusivo no tema claro para máxima ergonomia contábil, eliminando complexidade e manutenção duplicada.
- **Aliasing de Tokens:** Mapeamento direto nas variáveis do shadcn (`--background`, `--primary`, etc.) preserva estabilidade de todos os componentes existentes.
- **Seta do Tooltip:** `TooltipContent.vue` atualizado para eliminar `rotate-45`, atendendo estritamente à Invariante 2.
- **Exclusão de `MessagesPage.vue`:** Removida por não existir na arquitetura de rotas do app.
- **Autenticação com Hero em Noite:** Coluna esquerda das telas de login e cadastro ancorada em `#0F172A` para manter identidade editorial.

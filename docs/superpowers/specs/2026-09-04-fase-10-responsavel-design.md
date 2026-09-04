# Fase 10 — Experiência do Responsável (design)

> Aprovado pelo fundador em 2026-09-04. Backend nesta fase; **a PWA (web e mobile) fica fora
> de escopo** — o fundador desenvolve o front-end. Este documento é a fonte da intenção;
> ao divergir, atualize-o na mesma mudança.

## Problema

O Responsável hoje só existe como destinatário de email: recebe o Link de Upload, envia
arquivo e não tem como saber o que já mandou, o que falta, nem por que algo foi rejeitado
(a rejeição chega por email e morre ali). Perder o email é perder o acesso.

## Decisões de produto (fechadas no brainstorm)

| Tema | Decisão | Por quê |
|---|---|---|
| Login | **Passkey/biometria** como caminho normal, **magic link** por email como plano B e primeiro acesso | Reinstalar o app é raro; senha em quem usa 1×/mês é esquecida e cai no "esqueci" — que é um magic link. Passkey sincronizado (iCloud Keychain / Google Password Manager) sobrevive à reinstalação e à troca de aparelho |
| Senha | **Não existe** no sistema | Reintroduz o custo que o produto evita ("sem senha" é o diferencial) |
| Criação de conta | **Auto-serviço a partir do Link de Upload** | O token do link já prova posse da caixa de email — mesma força de um magic link. Não exige nada do Contador (que não tem tela) e deixa a fase autossuficiente |
| Convite pelo Contador | Fora de escopo (fica o 501 atual) | Auto-serviço cobre o caso; convite viraria meia tela de painel dentro desta fase |
| Visibilidade | **Por Empresa**, com histórico de **quem enviou** preservado e exibido | O checklist é obrigação da Empresa e os Responsáveis a representam; esconder gera retrabalho e item "enviado" sem explicação. `docs/domain.md` atualizado na mesma decisão |
| Conteúdo de documento | **Nunca servido ao Responsável** | Categoria `payroll` tem dado sensível (atestado médico); nome/status/prazo/autor resolvem a dúvida dele sem abrir superfície de LGPD |
| Plataforma | **PWA primeiro**, nativo depois só se o push no iOS provar ser problema | Sem loja, sem escolher RN vs Flutter no escuro; colapsa a Fase 9 até haver evidência contrária |
| Preferências de notificação | Fora de escopo | Configuração para valor que ninguém pediu ainda |
| Download dos próprios envios | Fora de escopo | Ele já tem os arquivos; leitura de conteúdo é a barreira que se mantém |

## Arquitetura

### Autenticação

Better Auth com dois plugins: `passkey` (WebAuthn) e `magicLink`. Nenhuma senha é criada
para Responsável (o `emailAndPassword` segue valendo só para Contador).

- **Criar acesso:** `POST /upload/:token/account` — atrás do `UploadTokenGuard` que já
  existe. Cria `user` (nome/email vindos de `contact`), preenche `contact.auth_user_id`,
  abre sessão. O front então oferece registrar passkey.
- **Reentrada:** passkey quando o dispositivo tem; magic link para o email do `contact`
  quando não tem ou é outro aparelho.
- **Revogação (pelo Contador):** `DELETE /companies/:id/contacts/:contactId/access` —
  zera `auth_user_id`, apaga sessões e passkeys. Conceder acesso sem poder revogar é
  defeito de segurança, não falta de feature.

### Escopo de acesso — terceiro tipo branded

Existem `FirmScope` (Contador) e `UploadScope` (link, só-escrita). Entra
**`ContactScope = { contactId, companyId }`**, construído SÓ em `modules/auth/` por um
`ContactGuard`. Consequências:

1. O `TenantGuard` é global e hoje rejeita sessão sem `accountant`; rotas do Responsável
   passam a ser marcadas e resolvidas pelo `ContactGuard`.
2. A regra de lint em `eslint.config.mjs` cresce para auditar o novo construtor de escopo
   (`toContactScope` só dentro de `modules/auth/`).
3. Todo repositório que sirva rota do Responsável exige `ContactScope` por assinatura.

### Rotas do Responsável (todas `ContactScope`)

| Rota | Devolve |
|---|---|
| `GET /me/contact` | quem sou, Empresa, Contabilidade |
| `GET /my/pending` | o que falta na Competência aberta, com prazo, ordenado por urgência |
| `GET /my/periods` | Competências com resumo (enviados/aceitos/pendentes) |
| `GET /my/periods/:id` | itens com status e, por item, os arquivos: nome, tamanho, quando, **quem enviou**, status e motivo de rejeição |
| `POST /my/periods/:id/documents` + `/confirm` | upload logado, reaproveitando o pipeline da Fase 4 (`file-rules.ts`, presign, confirm) com `ContactScope` |

Nenhuma delas serve conteúdo de arquivo.

### Banco

- `document.uploaded_by_contact_id` — FK nullable para `contact`. Via link vem do
  `upload_link`; logado vem da sessão. É o histórico de autoria que a decisão de
  visibilidade exige.
- `push_subscription` — `contact_id`, `provider` (`web`|`fcm`), `endpoint`, `keys jsonb`,
  unique em `endpoint`.
- `passkey` — tabela do plugin do Better Auth.

Tudo por **migration versionada** (`db:generate` + `db:migrate`).

### Push

`PushProvider` em `modules/messaging/providers/` (a interface de canal já existe), com
`web-push` + chaves VAPID no env. **Sem listener novo:** `RequestCreated`, `ItemReopened` e
`DeadlineMissed` já são emitidos; o listener passa a enviar email **e** push, registrando em
`message` com `channel: 'push'`. Falha de push nunca bloqueia o fluxo (mesma regra do email).

No iOS, Web Push exige "Adicionar à Tela de Início" (iOS 16.4+) — a PWA precisa instruir.

## Fatias (cada uma demonstrável por HTTP)

| Fatia | Entrega |
|---|---|
| F10-1 | migration (colunas + `push_subscription`) · magic link · `POST /upload/:token/account` · `ContactScope`/`ContactGuard` · `GET /me/contact` |
| F10-2 | passkey: registro e login |
| F10-3 | rotas de leitura com autoria (`/my/pending`, `/my/periods`, `/my/periods/:id`) |
| F10-4 | upload logado com `ContactScope` |
| F10-5 | Web Push: tabela, provider, subscribe, envio nos eventos existentes |
| F10-7 | revogação de acesso pelo Contador |

**F10-6 (PWA Angular) não é escopo deste spec** — fundador desenvolve. O backend entrega as
rotas acima já verificadas por HTTP.

## Pré-requisitos que vêm antes (lote aprovado em 2026-09-04)

A Fase 10 estende exatamente o que este lote conserta, então ele vem primeiro para não
haver retrabalho:

1. Migrations versionadas (`db:generate`/`db:migrate`) substituindo `drizzle-kit push`.
2. `size_bytes` **enforced** (limite de 100 MB deixa de depender da declaração do cliente).
3. Status que distingue `document` criada de enviada (hoje presign sem PUT deixa linha órfã).
4. Rotação do Link no lembrete.
5. Documento Extra revisável.
6. Aceite desfazível.
7. Rate limiting (`@nestjs/throttler`).
8. Convite de Contador por email (hoje a URL só volta no corpo da resposta).
9. Suíte de testes estrita de controllers, repositórios, adapters e integração/e2e.

## Testes

Cada fatia entrega teste junto: função pura testada isoladamente (elegibilidade,
autorização de escopo) e teste de integração exercitando a rota com banco real. A
invariante nova a proteger é **`ContactScope`**: Responsável de uma Empresa não alcança
dado de outra Empresa nem de outra Contabilidade, e nenhuma rota do Responsável devolve
conteúdo de documento.

## Riscos

| Risco | Mitigação |
|---|---|
| Web Push no iOS depende de A2HS | Instrução explícita na PWA; se a conversão for ruim, é o gatilho para o app nativo (Fase 9) |
| Quem tem o Link de Upload cria conta | O link já permite enviar documento no nome da Empresa hoje; e o Contador pode revogar (F10-7) |
| Passkey em aparelho antigo | Magic link é o plano B, sempre disponível |
| Resend/VAPID não verificados | Ambos dependem de credencial do fundador; o fallback de log cobre dev |

# Próximos passos — o que falta para "completo"

> Estado (2026-09-09). Este documento é o inventário do que **ainda não existe**. Nada aqui
> é bug: o que estava quebrado foi corrigido na mesma mudança que criou este arquivo (ver
> [Correções já feitas](#correções-já-feitas-2026-09-09) no fim). O que está listado abaixo é
> trabalho que nunca começou, quase sempre por decisão consciente registrada em
> [`decisions.md`](./decisions.md) ou no [`roadmap.md`](./roadmap.md).

Legenda de peso: 🔴 impede cobrar/operar · 🟠 queima na primeira semana de uso real ·
🟡 melhora, mas dá para viver sem.

## 1. Lacunas de produto

| Falta                                          | Peso | Detalhe                                                                                                                                             |
| ---------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cobrança / assinatura**                      | 🔴   | Não existe uma linha de código. É um SaaS sem como cobrar: sem plano, sem gateway, sem trial, sem bloqueio por inadimplência.                       |
| **Fase 8 — WhatsApp** (TASK-035)               | 🔴   | Citado pelos contadores no discovery como critério de troca. A tela de canais mostra "não conectado" e degrada para email.                          |
| **Push de "novo pedido"**                      | 🟠   | F10-5 promete push em novo pedido, rejeição e prazo. `request-created.listener.ts` só manda email — push existe só nos outros três eventos.         |
| **Baixar/ver Documento avulso** — parcial      | 🟠   | `GET /documents/:id/content` já existe e a tela de revisão pré-visualiza. Falta o mesmo na área do Responsável e no Painel de Pendências.           |
| **Gestão de equipe**                           | 🟠   | Sem listar Contadores, sem `PATCH /accounting-firm`, sem convidar/remover Contador pela tela, sem reset de senha (ver §2).                          |
| **Um Responsável, várias Empresas**            | 🟠   | `contact.auth_user_id` é UNIQUE: a mesma pessoa Responsável por três Empresas só consegue ter conta em UMA. Exige repensar o vínculo conta↔contato. |
| **Preferências de lembrete por Contabilidade** | 🟡   | Hoje é fixo: cron diário, máximo 2 cobranças por Solicitação, só email. Nada disso é configurável.                                                  |
| **Import XLSX**                                | 🟡   | Só CSV, com cabeçalho em inglês (`name`, `template`, `cnpj`, `contact_email`…). O contador exporta XLSX do sistema dele.                            |
| **Fase 9 — mobile nativo** (TASK-036/037)      | 🟡   | A PWA cobre o caso por ora (instalável, push, upload).                                                                                              |

## 2. Autenticação e conta

| Falta                                            | Peso | Detalhe                                                                                                                                                                           |
| ------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reset de senha do Contador**                   | 🟠   | `sendResetPassword` não está configurado no Better Auth e a tela foi omitida de propósito. Aceitável no concierge (você reseta na mão), inaceitável em self-service.              |
| **Confirmar posse do email no "perdi meu link"** | 🟡   | Hoje há um cooldown de 15 min por Solicitação (`access-recovery.controller.ts`) segurando o abuso. O correto é um link de confirmação em dois passos antes de rotacionar o token. |

## 3. Deploy, CI e infraestrutura

Fora do v1 por decisão de **2026-09-02** ("deploy e CI fora do roadmap v1"). Não é bug — é
trabalho que ainda não começou. O que falta, em ordem de dependência:

1. **Escolher o host.** Nada foi decidido (nem VPS, nem PaaS, nem Cloud Run). A escolha
   determina tudo o que vem abaixo.
2. **Dockerfile** para `apps/api` (Node 24, build multi-stage) e um passo de build estático
   para `apps/web`. Nenhum dos dois existe. `apps/api/docker-compose.yml` sobe **só o
   Postgres de desenvolvimento**.
3. **Reverse proxy servindo web e API na MESMA origem.** É o desenho assumido por
   `environment.prod.ts` (`apiUrl: ''`) e por `better-auth.ts`: com uma origem só, o cookie
   de sessão é first-party e não precisa de `SameSite=None`. Requisitos:
   - `/api/auth/*` e as rotas REST da API → `apps/api`;
   - todo o resto → os estáticos do `apps/web`, com **fallback SPA** para `index.html`
     (sem ele, recarregar `/minha-area/pendencias` dá 404);
   - TLS terminado no proxy.
   - **Se um dia web e API forem para hosts diferentes** (`app.` ↔ `api.`), o
     `better-auth.ts` já se configura sozinho a partir de `WEB_URL`/`BETTER_AUTH_URL`
     (cookie com `domain=.dominio` + `SameSite=None; Secure`) e falha no boot se os dois
     não compartilharem um domínio. Falta ajustar `environment.prod.ts`.
4. **Migrations no deploy.** `pnpm db:migrate` precisa rodar antes de subir a versão nova.
5. **CI.** Nenhum workflow existe. O mínimo: `pnpm lint`, `pnpm -r build` e `pnpm --filter api test`
   (a suíte de integração exige um banco `competa_test`).
6. **Chaves VAPID em produção.** `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (gere com
   `npx web-push generate-vapid-keys`). Sem elas o push fica desligado e a UI não oferece o
   recurso — a chave pública é servida por `GET /push/vapid-key`, então **não** há build novo
   do front para trocá-la.

## 4. Observabilidade

O que já existe: `GET /health` (toca o banco), `enableShutdownHooks()`, `helmet()`,
`trust proxy` em produção e o `Logger` do Nest em toda falha de canal.

| Falta                    | Peso | Detalhe                                                                                             |
| ------------------------ | ---- | --------------------------------------------------------------------------------------------------- |
| **Rastreamento de erro** | 🟠   | Sem Sentry (ou equivalente). Hoje um 500 vive só no stdout do processo.                             |
| **Log estruturado**      | 🟡   | O `Logger` padrão do Nest imprime texto. Sem JSON não há como filtrar por tenant/rota no agregador. |
| **Métrica e alerta**     | 🟡   | Sem contador de email/push falhado, sem alerta de cron que não rodou.                               |

## 5. LGPD operacional

🟠 **O produto guarda documento fiscal de terceiros** — nota, extrato, folha — enviado por
pessoas que não são clientes da Pygmus, mas clientes do cliente. O tratamento é feito **como
operador**, por conta da Contabilidade (controladora). Nada disso está implementado nem
escrito:

1. **Política de privacidade e termos** — não existem. Nem página, nem aceite registrado.
   O Link de Upload é entregue por email a um terceiro que nunca aceitou nada.
2. **Contrato de operador** com cada Contabilidade (o que o produto pode fazer com o dado,
   por quanto tempo, suboperadores usados — hoje Cloudflare R2 e Resend).
3. **Retenção e expurgo.** Não há prazo definido nem rotina de descarte. Documento fiscal
   tem prazo legal de guarda (5 anos, em geral), mas "guardar para sempre" não é política —
   é ausência de política. Precisa de: prazo por tipo de documento, job de expurgo do
   Postgres **e** do R2, e o que acontece quando uma Contabilidade cancela.
4. **Exportação e exclusão a pedido do titular** (arts. 18, IV e VI). Hoje não há rota nem
   procedimento manual escrito. Inclui o `contact` e o `push_subscription` dele.
5. **Registro das operações de tratamento** (art. 37) — o inventário de quais dados são
   coletados, por quê, e para onde vão.
6. **Plano de resposta a incidente** (art. 48): quem é avisado, em quanto tempo, com que
   texto.
7. **Encarregado (DPO)** nomeado e um canal público de contato.

> Ordem sugerida: 1 e 3 primeiro (política + retenção) — são os que aparecem na primeira
> venda para uma contabilidade que tenha jurídico.

## 6. Backup e recuperação

🔴 **Nenhum plano existe.** Nem para o Postgres, nem para o R2. Não é "falta configurar" —
é que ninguém decidiu ainda RPO/RTO nem onde a cópia mora. O mínimo defensável:

**Postgres**

- `pg_dump` diário para um bucket **diferente** do de documentos (provedor diferente, de
  preferência), com retenção 7 diários + 4 semanais + 12 mensais.
- Point-in-time recovery (WAL): no Supabase é add-on pago (não vem no Free nem no Pro
  puro) — decidir se entra no orçamento ou se o `pg_dump` diário é o RPO aceito por agora.
- **Restauração testada.** Backup nunca restaurado não é backup. Um teste trimestral de
  restore num banco descartável, com o resultado anotado.

**R2 (documentos)**

- Versionamento de objeto ligado no bucket (protege contra exclusão e sobrescrita).
- Replicação para um segundo bucket/região, ou um `rclone sync` agendado para outro
  provedor.
- O R2 e o Postgres precisam ser recuperáveis **para o mesmo instante**: `document.storage_key`
  sem o objeto é um zip que não abre (hoje o download já falha antes de começar, com 503 —
  mas o documento continua perdido).

**Cofre de segredos**

- `BETTER_AUTH_SECRET`, chaves do R2, `RESEND_API_KEY` e o par VAPID precisam existir fora
  do host. Perder o `BETTER_AUTH_SECRET` invalida toda sessão; perder a VAPID privada mata
  todas as inscrições de push já gravadas.

## Correções já feitas (2026-09-09)

Ficam registradas aqui para que ninguém as reabra como pendência:

- **Build de produção** apontava para `http://localhost:3000`: faltava `fileReplacements` no
  `apps/web/angular.json`. Corrigido; `environment.prod.ts` agora é de fato usado.
- **Chave VAPID** saiu do bundle e passou a vir de `GET /push/vapid-key`.
- **Push nunca aparecia na tela**: o payload não tinha o formato
  `{ notification: { title, … } }` que o `ngsw-worker.js` exige, e o `message` era marcado
  como entregue mesmo assim.
- **XSS armazenado** via `content_type` declarado pelo Responsável: allowlist em
  `servedContentType()`, `inline` só para PDF/PNG/JPEG, e `nosniff` global pelo helmet.
- **Rate limit global** atrás de proxy: `trust proxy` em produção.
- **Import de CSV** sem limite e sem transação: cap de 1000 linhas no contrato + insert em
  lote numa transação.
- **Zip truncado com HTTP 200**: os objetos são conferidos antes do primeiro byte, e
  `finalize()` deixou de ser promise flutuante.
- **SSRF cego armazenado** pelo `endpoint` de push: allowlist de hosts de push.
- **`/access/recover`** invalidava o link vivo da vítima: cooldown de 15 min e o token só
  passa a valer depois que o email sai.
- **Sem helmet**, sem healthcheck, sem `enableShutdownHooks`: os três entraram.
- **Índices** em `document(request_id)`, `document(request_item_id)`,
  `upload_link(request_id)`, `contact(email)`, `contact(company_id)`.
- **`notify()` sem try/catch** derrubava o processo por unhandled rejection;
  `markDeadlineNotified` marcava antes de a entrega confirmar.
- **Cookie cross-subdomain** não configurado no Better Auth.

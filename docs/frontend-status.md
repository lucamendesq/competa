# Frontend — estado das telas (2026-09-07; revisado 2026-09-11)

O que existe em `apps/web`, o que ficou degradado por falta de rota na API e o que exige
configuração para funcionar. Complementa o [`roadmap.md`](./roadmap.md).

## Telas entregues

| Rota                                     | Tela                                                                                                                 | Estado                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `/entrar`                                | Login do Contador (com "Esqueci minha senha")                                                                        | completa                                                    |
| `/esqueci-senha`, `/redefinir-senha`     | Reset de senha do Contador (token 1h, resposta cega)                                                                 | completa (2026-09-11)                                       |
| `/convite/:token`                        | Aceitar convite (define senha, Contador e Responsável)                                                               | completa; convite já usado manda para a entrada             |
| `/perdi-meu-link`                        | Pedido de novo Link (passo 1: email de confirmação de posse)                                                         | completa (2 passos desde 2026-09-11)                        |
| `/perdi-meu-link/confirmar`              | Passo 2: botão que confirma posse e rotaciona o Link                                                                 | completa (2026-09-11)                                       |
| `/termos`, `/privacidade`                | Páginas legais (conteúdo provisório até revisão jurídica)                                                            | completa (2026-09-11); aceite em `user.terms_accepted_at`   |
| `/competencias`                          | Lista + KPIs + modal "Abrir competência"                                                                             | completa, com prévia do fan-out e resumo dos links          |
| `/competencias/:id`                      | **Painel de Pendências** ("quem faltou")                                                                             | completa, com falha de canal visível                        |
| `/solicitacoes/:id`                      | Revisão da Solicitação (aceite em lote, rejeição, extras, preview/baixar avulso)                                     | completa                                                    |
| `/empresas`                              | Lista de Empresas                                                                                                    | completa                                                    |
| `/empresas/nova`, `/empresas/:id/editar` | Cadastro/edição + prévia do checklist efetivo                                                                        | completa                                                    |
| `/empresas/importar`                     | Importar planilha + relatório por linha                                                                              | completa (.xlsx e .csv, cabeçalhos PT aceitos)              |
| `/empresas/:id/checklist`                | Overrides por Empresa                                                                                                | completa                                                    |
| `/checklists`, `/checklists/:id`         | Templates do produto e derivados editáveis                                                                           | completa                                                    |
| `/mensagens`                             | Log de entrega + detalhe do erro                                                                                     | completa (2026-09-15)                                       |
| `/configuracoes/*`                       | Contabilidade (nome editável) · Contadores (lista/remover/convites) · Lembretes (preferências) · Canais              | completa desde 2026-09-11, menos Canais (WhatsApp = Fase 8) |
| `/envio/:token`                          | **Página pública de envio** (mobile-first, sem senha)                                                                | completa                                                    |
| `/minha-area/*`                          | Área do Responsável (acesso, pendências, histórico, envio logado, preview/baixar documento, multi-empresa com badge) | completa                                                    |

## Degradado por falta de rota na API

Decisão de 2026-09-07: construir a tela com o que a API expõe hoje, em vez de inventar
endpoint. **Revisão 2026-09-11: a maioria das lacunas fechou** — ficou assim:

1. ~~Configurações → Contabilidade somente leitura~~ — ✅ `GET/PATCH /accounting-firm`
   (nome, preferências de lembrete, logotipo e e-mail de contato, só o dono — COM-24).
2. ~~Configurações → Contadores não lista a equipe~~ — ✅ lista (`GET /accountants`),
   remove com confirmação (`DELETE /accountants/:id`, nunca o dono), convites pendentes
   com revogação (`GET/DELETE /invites`).
3. ~~Configurações → Lembretes fixo~~ — ✅ máx/D-N/gap configuráveis pelo dono; canal e
   hora do cron seguem fixos.
4. **Configurações → Canais** mostra WhatsApp como "não conectado" (Fase 8 não construída).
5. ~~Baixar/visualizar um Documento avulso~~ — ✅ preview/baixar na revisão
   (`GET /documents/:id/content`) e na área do Responsável (`GET /my/documents/:id/content`).
6. ~~Reenviar mensagem individual~~ — ✅ `POST /messages/:id/resend` e botão "Reenviar mensagem"
   no detalhe do envio em `/mensagens`.
7. ~~Colunas ausentes~~ — ✅ "Aberta em" da Competência, nome/e-mail do Responsável na lista de
   Empresas, "empresas usando" no template.
8. ~~Filtros de Mensagens~~ — ✅ filtros por Empresa (`companyId`), Canal (`channel`) e Tipo
   (`purpose`) aplicados no banco na API e sincronizados com a paginação.
9. ~~"Esqueci minha senha" do Contador omitido~~ — ✅ `sendResetPassword` configurado +
   telas `/esqueci-senha` e `/redefinir-senha`. (O Responsável não tem senha obrigatória —
   ver D14.)
10. ~~Importar planilha só `.csv`~~ — ✅ aceita `.xlsx` (convertido no browser, 1ª aba) e
    cabeçalhos em português ("Razão Social", "E-mail do responsável"…); a API continua
    recebendo `{ csv }`.

## Mudanças fora do `apps/web` feitas junto com as telas

`GET /upload/:token` passou a devolver, por Item, o **nome** dos arquivos já enviados com
`reviewStatus` e `rejectionReason` (mais os Documentos Extras). Sem isso o Responsável não
conseguia saber o que já mandou nem por que um arquivo foi recusado. Continua valendo o
invariante: nenhum conteúdo, nenhum `storage_key`, nenhuma rota de download sob o
`UploadTokenGuard` (ver [`AGENTS.md`](../AGENTS.md) regra 3, atualizada na mesma mudança).
O teste `upload-token-guard.test.ts` passou a checar a regra nova: metadado sim,
`storage_key` nunca.

`libs/contracts/src/company.ts`: as mensagens de `ContactBody` foram traduzidas. Elas
chegam ao usuário nos dois lados — no formulário do Angular e no relatório da importação de
planilha —, e "Invalid email address" aparecia em inglês para o Contador.

## Acessibilidade

Checagem estrutural rodada nas telas densas do painel: todo controle tem nome acessível,
todo campo tem `label`, sem `id` duplicado, sem salto de nível de heading, um `h1` por
página. Status nunca é só cor — sempre ícone + texto.

**Correção de contraste:** o design system pede WCAG AA, mas os pares que ele especifica
não entregam 4.5:1 para texto pequeno (as pílulas de status são 11px): `slate-500/slate-100`
dava 4.34, `red-600/red-50` 4.41, `emerald-600/emerald-50` 3.58 e `amber-600/amber-50` 3.07.
O tom do texto desceu um passo (`-600` → `-700`, `slate-500` → `slate-600`), mantendo fundo
e borda; agora os quatro ficam entre 4.8 e 6.9. `blue-600/blue-50` (4.75) já passava e não
mudou. Ícones decorativos maiores seguem em `-600`, onde o mínimo é 3:1.

## Quem convida: só o dono

`POST /invites` exige que o Contador da sessão seja **dono** da Contabilidade, senão
responde `403 ONLY_OWNER_CAN_INVITE`. Dono é o **primeiro Contador do tenant** — quem
aceita o convite inicial do `create-firm`, ou seja, quem entra pelo e-mail do escritório.
`accountant.owner` marca isso, `accountant_owner_uidx` garante um por Contabilidade, e
`GET /auth/me` devolve o campo para a tela decidir o que oferecer.

Escolhi ancorar em "primeiro Contador" e não em "o e-mail bate com o da Contabilidade"
porque hoje não existe coluna de e-mail no `accounting_firm` — e amarrar uma regra de
autorização a um campo de texto editável significaria que trocar o e-mail transfere o
controle do tenant. A gestão de equipe existe desde 2026-09-11 (listar, remover, revogar
convite, `PATCH /accounting-firm` — tudo do dono); **transferência de titularidade** segue
não construída: o dono não pode ser removido (`422 CANNOT_REMOVE_OWNER`) e não há troca de
dono pela tela.

## Acesso do Responsável — opcional, um toque (D14)

A conta **nunca** é pré-requisito de enviar documento. O único email obrigatório do produto
é o Link de Upload, na abertura da Competência.

| Momento                                         | O que acontece                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cadastro da Empresa / novo Responsável          | **Nada é enviado a ele**                                                                                                                                     |
| Abertura da Competência (fan-out)               | **Link de envio** (`/envio/:token`) — toda Empresa ativa com email de Responsável                                                                            |
| Tela de sucesso do envio                        | Duas ofertas: **"Ativar avisos neste aparelho"** (push, sem conta) e **"Ativar acesso"** (um toque, sem senha)                                               |
| Painel → Empresas                               | **"Convidar para o app"** por Empresa — atalho do Contador que quer empurrar, nunca mecanismo                                                                |
| Home → **"Perdi meu link"** (`/perdi-meu-link`) | 2 passos (2026-09-11): email de confirmação de posse → botão em `/perdi-meu-link/confirmar` rotaciona e reenvia. Quem já tem acesso recebe magic link direto |

**Duas criações de conta, prazos de validade opostos** (ver Amendment da D14):

- `POST /upload/:token/access` — **um toque, sem senha**, e a sessão vem no próprio
  `Set-Cookie`: a rota emite um magic link pelo Better Auth e o consome na mesma
  requisição (interceptado em `infra/auth/magic-link-sender.ts`, então o email nunca sai do
  processo). Pode ser sem credencial porque o Link de Upload é renovado todo mês.
- `POST /invites/:token/contact-account` — **define a senha** e o front entra em seguida com
  ela. O convite é de uso único: sem credencial própria, o Responsável ficaria sem porta
  depois de aceitá-lo.

A entrada (`/minha-area/acesso`) oferece **as três portas** — senha, passkey e magic link —
porque as duas formas de conta convivem. Convite reaproveitado responde 409 e a tela manda
para a entrada, não para um erro seco.

**Push não depende de conta.** `POST /upload/:token/push` grava a subscription com o
`contact_id` resolvido pelo token. Como ela se liga ao `contact` e não à Solicitação,
sobrevive ao fan-out do mês seguinte.

**"Perdi meu link"** tem limite de 3/min e responde **exatamente a mesma coisa** para email
com acesso, Responsável sem acesso e email desconhecido, com um piso de tempo comum — a
mensagem não pode revelar quem é cliente de quem, e o relógio também não. Desde
2026-09-11 o fluxo é em **2 passos** (AUTHZ-3): o passo 1 só envia um email de confirmação
de posse (token HMAC, 30 min); rotacionar exige o passo 2, um botão em
`/perdi-meu-link/confirmar` — nunca auto-fire no load, para scanner de email não matar o
link vivo.

O que a Empresa mostra na lista deixou de ser trava: "Sem Responsável" (vermelho, bloqueia
mesmo), "Envia por link" (neutro — é o caminho normal) e "Usa o app" (verde).

## Identidade do remetente

Todo e-mail que chega ao Responsável diz de quem é, resolvido num ponto só (`deliver` e
`sendWithoutLog`), para não depender de cada payload de evento lembrar:

- remetente: `{Contabilidade} via Coleta de Documentos <endereço verificado>`
- assunto: `{Contabilidade} · {assunto original}`
- rodapé: `Enviado por {Contabilidade} através do Coleta de Documentos.`

## Provedores por ambiente

A escolha é do `NODE_ENV`, não da presença de credencial: em `development`/`test` **nenhum
provedor externo é usado**, e em `production` a subida falha nomeando a variável que falta.

|                      | dev / test                                 | produção                                                             |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Storage (documentos) | disco, em `STORAGE_LOCAL_DIR` (`.storage`) | Cloudflare R2 (`R2_*`)                                               |
| E-mail               | log no console (`LogEmail`)                | Resend (`RESEND_API_KEY`)                                            |
| Web Push             | log no console                             | VAPID; sem as chaves, falha registrada em `message` (não "entregue") |

Isso deixa `pnpm --filter api start:dev` funcionar num clone novo sem nenhuma credencial, e
tira do produto a chance de um deploy de produção gravar documento no disco do container ou
"enviar" e-mail para o log em silêncio. O desvio de destinatário em ambiente de teste
(`EMAIL_DEV_RECIPIENT`) foi removido: em dev o corpo do e-mail já está inteiro no console.

## Configuração necessária

- `apps/web/src/environments/environment.ts` (dev): `apiUrl` aponta a raiz da API
  (`http://localhost:3000`) porque o Nest **não** usa `setGlobalPrefix`; o Better Auth fica
  em `${apiUrl}/api/auth`.
- `environment.prod.ts` (usado no build de produção por `fileReplacements` no
  `angular.json`): `apiUrl` = `https://api.competa.com.br` — produção roda em **origens
  separadas** (`app.` no Cloudflare Pages, `api.` no Fly; cookie `domain=.competa.com.br`
  com `SameSite=Lax` + Origin-check, ver TASK-039). Sem o `fileReplacements` o bundle de
  produção sai apontando para `localhost:3000`; se mexer no `angular.json`, confira com
  `grep -r localhost:3000 apps/web/dist`.
- A chave pública VAPID **não** fica no bundle: o front busca em `GET /push/vapid-key` e, se
  vier vazia, o botão de notificações não aparece. Trocar a chave é mexer só no `.env` da API.
- `libs/contracts` precisa estar compilado (`pnpm --filter contracts build`): os mesmos
  schemas zod validam o formulário do Angular e o pipe do Nest.

## PWA

Instalável pela área do Responsável: `manifest.webmanifest` com `start_url`
`/minha-area/pendencias`, ícones 192/512 comuns e maskable, `display: standalone`, e
service worker do Angular (`ngsw-config.json`) com **prefetch só de casca e assets**.
Não há `dataGroups`: resposta de API nunca é cacheada — documento contábil velho em tela é
pior do que tela vazia. Verificado com build de produção: SW ativo, casca abre offline.

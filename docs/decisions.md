# Decisões Arquiteturais — Coleta de Documentos Contábeis

> Registro do "porquê" das decisões (antigas ADRs). Ao reverter/superar uma decisão, adicione uma nova entrada em vez de reescrever a antiga.
> Autor: Luca Mendes (fundador). Datas entre 2026-08-26 e 2026-08-27.

## Índice

| #                                                                                 | Decisão                                                              | Status                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| [D01](#d01--backend-monólito-modular)                                             | Backend monólito modular com bounded contexts como pastas            | Parcialmente superada por D07/D10               |
| [D02](#d02--better-auth-para-autenticação)                                        | Better Auth para autenticação (substitui Supabase Auth)              | Vigente                                         |
| [D03](#d03--banco-e-código-em-inglês-ubíqua-pt-br)                                | Banco e código em inglês; linguagem ubíqua PT-BR                     | Vigente                                         |
| [D04](#d04--checklist-por-template--overrides)                                    | Checklist por referência a template + overrides (não cópia)          | Vigente                                         |
| [D05](#d05--competência-como-ciclo-prazo-por-item)                                | Competência como ciclo; prazo opcional por item                      | Vigente                                         |
| [D06](#d06--multi-arquivo--zip-sem-extração)                                      | Multi-arquivo nativo + zip aceito sem extração                       | Vigente                                         |
| [D07](#d07--monorepo-frontend--api-nestjs)                                        | Monorepo: frontend + API NestJS separada                             | Parcialmente superada por D10                   |
| [D08](#d08--better-auth-na-api-nestjs)                                            | Better Auth na API NestJS; guards como fronteira de acesso           | Vigente                                         |
| [D09](#d09--feature-modules-camadas-sob-demanda)                                  | Feature modules; camadas sob demanda; DDD tático descartado          | Vigente (item 3 refinado por D10)               |
| [D10](#d10--angular-spa-csr--nx)                                                  | Angular SPA (CSR) como frontend; monorepo Nx; mobile em aberto       | Parcialmente superada por D-06 da spec (sem Nx) |
| [D11](#d11--tailwind--spartan-ui)                                                 | Styling do web: Tailwind CSS + Spartan UI                            | Vigente                                         |
| [D12](#d12--storageprovider-r2-em-produção-disco-em-dev)                          | StorageProvider: R2 em produção, disco em dev                        | Vigente                                         |
| [D13](#d13--responsável-com-senha-e-competência-só-para-quem-configurou-o-acesso) | Responsável com senha; Competência só cobra quem configurou o acesso | Superada por D14 (itens 1, 4 e 6)               |
| [D14](#d14--conta-do-responsável-é-opcional-push-não-depende-de-conta)            | Conta do Responsável é opcional; push não depende de conta           | Vigente                                         |
| [D15](#d15--provedor-externo-é-escolhido-pelo-node_env-não-pela-credencial)       | Provedor externo é escolhido pelo `NODE_ENV`, não pela credencial    | Vigente (supera o mecanismo da D12)             |

---

## D01 — Backend monólito modular

**Contexto:** dev solo, 3 bounded contexts. Separar em serviços independentes multiplicaria custo de operação/deploy sem demanda de escala (~50 escritórios ≈ 1.500 destinatários/mês).

**Decisão:** um único backend (monólito) com os bounded contexts como **módulos/pastas**; import cruzado proibido, comunicação por eventos/funções públicas. Eventos começam síncronos; fila/broker só se o volume pedir.

**Alternativas rejeitadas:** microsserviços por context (sofisticação sem demanda, triplica operação); serverless por caso de uso (fragmenta o domínio, dificulta o fan-out transacional e testes de invariantes).

**Status:** parcialmente superada — o backend segue monólito modular, mas vive em `apps/api` (NestJS) num monorepo Nx (D07/D10); a organização em módulos foi refinada por D09.

## D02 — Better Auth para autenticação

**Contexto:** a modelagem inicial assumia Supabase Auth (magic link). O fundador decidiu remover o acoplamento a provedor externo.

**Decisão:** **Better Auth** com adapter Drizzle — tabelas de auth (`user`, `session`, `account`, `verification`) no **mesmo Postgres**. Login do Contador por email+senha e/ou magic link; Responsável cadastrado usa a mesma instância. O **Link de Upload continua sendo token próprio do produto** (não é sessão, não passa pelo Better Auth). **Isolamento multi-tenant é responsabilidade da aplicação** (escopo por `accounting_firm_id` via helper obrigatório), não de RLS acoplada a `auth.uid()`.

**Consequências:** sem vendor lock-in; joins diretos com `auth_user_id`; transação única no signup; custo zero por MAU. Em troca, rate limit / emails de verificação / hardening / isolamento por tenant ficam sob nossa responsabilidade.

**Alternativas rejeitadas:** Supabase Auth (acopla auth ao host do banco); Clerk/Auth0 (custo por MAU + dependência externa); NextAuth (DX inferior para o stack).

## D03 — Banco e código em inglês; ubíqua PT-BR

**Contexto:** a modelagem original mandava código PT-BR (`Solicitacao`, `abrirCompetencia()`). O fundador decidiu tabelas/colunas em inglês (schema Drizzle É código; tabelas do Better Auth já são EN).

**Decisão:** **identificadores técnicos em inglês** (tabelas, colunas, entidades, funções, eventos, pastas). **Linguagem ubíqua PT-BR** em docs/UI/conversas e em dados exibidos (catálogo permanece em PT — é dado). O **mapa PT↔EN** ([`domain.md`](./domain.md#glossário-linguagem-ubíqua-pten)) é **normativo**. Convenções: tabelas snake_case singular; tipos PascalCase; eventos PascalCase verbo no passado. Proibidos: `client`, `user`, `month` soltos.

**Alternativas rejeitadas:** código todo em PT-BR (conflita com schema EN); misto tabelas EN + entidades PT (pior dos dois mundos).

## D04 — Checklist por template + overrides

**Contexto:** ao cadastrar Empresa, o Contador escolhe um template e pode editá-lo levemente. Referência vs. cópia?

**Decisão:** **referência + override.** `company.checklist_template_id` aponta o template; desvios viram `company_checklist_override` (`add`/`remove`). O **checklist efetivo** é computado por consulta (template − removidos + adicionados). Templates do produto são imutáveis; a Contabilidade **deriva** o seu (`derived_from`). Na **abertura da Competência**, o checklist efetivo é congelado como snapshot em `request_item`.

**Consequências:** editar o template propaga para todas as Empresas do tipo no mês seguinte; snapshot dá a invariante "checklist congelado" sem versionamento.

**Alternativas rejeitadas:** cópia no cadastro (atualizar template não propaga → N edições); versionamento completo de template (complexidade sem demanda).

## D05 — Competência como ciclo; prazo por item

**Contexto:** documentos têm vencimentos diferentes (extrato após o mês; DAS após ~dia 20; folha dentro do próprio mês). Cogitou-se abandonar a Competência e agendar por tipo de documento.

**Decisão:** **a Competência (`period`) permanece a unidade do ciclo** (fan-out, painel, zip, encerramento). O vencimento entra **por item, dentro do ciclo**: `due_day` + `due_month_offset` (0 = mês de referência; 1 = mês seguinte), opcionais. `request_item.due_date` congelado na abertura; `NULL` herda o prazo da competência. **Lembretes continuam por Solicitação** (uma mensagem agrupa os itens pendentes). `DeadlineMissed` passa a ser por item.

**Alternativas rejeitadas:** cobrança exclusiva por tipo de documento (multiplica mensagens ~5–6×, mata o "abrir o mês", scheduler complexo); prazo único por competência (mantido só como fallback).

## D06 — Multi-arquivo + zip sem extração

**Contexto:** itens como "Notas Fiscais" variam de 1 a centenas de arquivos/mês.

**Decisão:** **os dois.** Multi-arquivo é o caminho principal da UI (1 Item : N Documentos). **Zip aceito como formato a mais, armazenado sem extração na v1** (é o que emissores/portais já exportam). **Sem parsing/validação de XML de NF na v1.** **Revisão em lote** opera no Item. **Upload direto ao R2** por URL pré-assinada. **Limites:** 100 MB/arquivo, 500/envio.

**Consequências:** zero fricção nos dois extremos; nenhuma superfície de zip bomb/path traversal na v1. Painel não mostra quantas notas há num zip (melhoria v1.5: ler o central directory sem extrair).

**Alternativas rejeitadas:** só multi-arquivo (força descompactar o lote); só zip (impraticável no celular); zip com extração server-side (adiada — risco > benefício na v1).

## D07 — Monorepo: frontend + API NestJS

**Contexto:** a D01 previa monólito Next.js fullstack. O modelo híbrido do Next (Server Components/Actions/Route Handlers) exigia uma tabela de decisão por operação — o fundador prefere o paradigma único Controller → Repositório, com tudo exposto como API HTTP. Cargas que favorecem um processo Node persistente: cron de lembretes e streaming de zip.

**Decisão:** **monorepo** com frontend e **API NestJS separada**. **Toda operação é endpoint REST da API Nest** (sem Server Actions, sem lógica de negócio no front). Drizzle/migrations/schema em `apps/api/src/database/`. Cron via `@nestjs/schedule`; zip por streaming; contratos zod compartilhados desde o dia 1.

**Consequências:** um paradigma só (velocidade de dev solo); mobile futuro consome a mesma API. Em troca: dois deploys e CORS/cookies entre origens; painel faz round-trip HTTP (aceito).

**Alternativas rejeitadas:** Next fullstack (conflita com o fluxo mental do fundador); tudo em Route Handlers (paga o imposto de API sem ganhar estrutura); Node/Express puro (reinventa o esqueleto do Nest).

**Status:** parcialmente superada por D10 (Next.js → Angular; pnpm workspaces → Nx). Permanecem válidos: API NestJS separada, tudo como REST, contratos compartilhados, cron/streaming na API.

## D08 — Better Auth na API NestJS

**Contexto:** com o backend em NestJS (D07), a integração Better Auth ↔ Nest é mantida pela comunidade (`@thallesp/nestjs-better-auth`). Reavaliou-se Better Auth vs Supabase Auth do zero.

**Decisão:** **manter Better Auth**, montado na API Nest. Fundamentos: signup transacional (`user` + `accounting_firm` + `accountant` no mesmo Postgres, uma transação); email transacional já no dia 1; client Expo oficial barateia o mobile; lock-in ≈ zero. **Forma:** pacote comunitário **com fallback manual documentado** (~40 linhas: `toNodeHandler(auth)` em `/api/auth/*`, `bodyParser: false` nessas rotas, guard via `auth.api.getSession()`). **Fronteira de acesso = Guards do Nest:** `AuthGuard` (sessão) → `TenantGuard` + `@CurrentScope()` injeta **`FirmScope`** (tipo branded inconstruível fora de `auth/`, exigido por todo repositório) → `UploadTokenGuard` para as rotas públicas de upload (`UploadScope`, só escrita).

**Consequências:** isolamento por tenant garantido por **tipo**, não por disciplina. Em troca: glue comunitário no caminho crítico (mitigado pelo fallback); cookies de sessão entre `app.` e `api.` exigem configuração explícita.

**Alternativas rejeitadas:** Supabase Auth (quebra a atomicidade do signup); Passport (não é auth completo — hash/sessão/reset/magic link na mão); Clerk/Auth0 (custo + dependência externa).

## D09 — Feature modules, camadas sob demanda

**Contexto:** a modelagem original prescrevia DDD tático (fronteiras policiadas, `events.ts`, fachadas `public.ts`, agregados, `entities/`, `vo/`). Para um MVP de ~14 tabelas de dev solo, é cerimônia sem retorno.

**Decisão:**

1. **O feature module do Nest É o bounded context na dose certa** — organização por feature, nunca por camada.
2. **Duas camadas: controller → repository.** Um repositório por módulo, sem camada de use case (revisto em 2026-09-04: a camada só existia em 4 pontos e cada um era um repasse a mais para ler; a lógica real virou método do repositório).
3. **Eventos de domínio são vocabulário** (nos docs); no código, comunicação entre módulos (item refinado por D10 → `@nestjs/event-emitter` síncrono).
4. **Sem `entities/`/`vo/`:** tipo da entidade = `$inferSelect` do Drizzle; VOs em `common/` quando surgirem.
5. **Direção de dependência é convenção, não polícia:** companies/checklists → periods/requests → messaging.
6. **O que NÃO se abre mão:** `FirmScope`/`UploadScope` nos repositórios, interface única por provedor de mensagem, invariantes cobertas por transação no repositório, contratos zod em `libs/contracts`.

**Alternativas rejeitadas:** DDD tático completo (indireção paga em toda feature; vale para times grandes); organização por camada (cada mudança toca 4+ pastas, briga com o Nest).

## D10 — Angular SPA (CSR) + Nx

**Contexto:** a D07 definia Next.js frontend-only. Reavaliação do fundador.

**Decisão:**

- **`apps/web` = Angular SPA (CSR)** — sem SSR/hydration; deploy estático atrás de CDN.
- **`apps/api` = NestJS** — inalterado (D07/D08 seguem valendo).
- **Monorepo Nx** (substitui pnpm workspaces puro) com **`libs/contracts`** (zod compartilhado web ↔ api ↔ mobile).
- **Eventos síncronos entre módulos via `@nestjs/event-emitter`** (refina D09). In-process; fila/outbox fora da v1.
- **Sem CQRS, sem microservices** — só `@Module` + event-emitter síncrono.
- **Escopo multi-tenant estrutural:** Guard/Interceptor request-scoped injeta `FirmScope`.
- **Mobile fica EM ABERTO: React Native vs Flutter.** Insumos: client Expo oficial do Better Auth favorece RN; Flutter adiciona Dart (2ª linguagem) e exigiria client de auth próprio.

**Racional:** um paradigma (módulos/DI/decorators) do front ao back; Nest expressa bounded contexts/eventos/tenant-scoping com suporte de framework; painel é forms/CRUD-pesado (Typed Reactive Forms encaixa); nada precisa de SSR.

**Alternativas rejeitadas:** manter Next frontend-only (subutilizado sem SSR, filosofia distinta do Nest); React SPA/Vite (sem apego a React nem certeza do RN); Angular Universal/SSR (nenhuma página precisa de SEO/first-paint público).

**Status:** parcialmente superada — o item "Monorepo Nx" foi revertido pela D-06 da spec (`docs/superpowers/specs/2026-09-01-backend-mvp-design.md`): **pnpm workspaces puro**, sem Nx. Motivo: dev solo, só dois apps (`web`, `api`) — o ganho de Nx (cache de build, task graph, boundaries) é baixo nessa escala e não paga a cerimônia de configuração/manutenção. Os demais itens da decisão (Angular SPA/CSR, `libs/contracts`, eventos síncronos, escopo multi-tenant estrutural, mobile em aberto) seguem vigentes.

## D11 — Tailwind + Spartan UI

**Contexto:** com Angular decidido (D10), faltava o sistema de estilo/componentes.

**Decisão:** **Tailwind CSS** como motor de estilo (utilities no template por padrão; upload é mobile-first). **Spartan UI** como biblioteca de componentes (shadcn-style para Angular, headless sobre CDK) — os componentes entram no repositório e são estilizados com Tailwind. **Angular Material descartado.** SCSS por componente só quando um estilo não for expressável em utilities (deve ser raro).

**Consequências:** um único sistema de estilo; componentes Spartan vivem no repo (customização de marca sem lutar contra encapsulamento). Em troca: widgets pesados (datepicker, table, dialog) exigem composição via Spartan/CDK.

**Alternativas rejeitadas:** Angular Material (visual opinado, customização dolorosa); SCSS por componente (overhead de arquivo/nomenclatura em app CRUD-pesado).

## D12 — StorageProvider: R2 em produção, disco em dev

**Contexto:** a fatia central do produto (upload direto por URL pré-assinada, TASK-022) precisa
de storage S3-compatible, mas o projeto roda local e ninguém quer criar bucket para abrir a API.

**Decisão:** `StorageProvider` (abstract class no DI) com **duas** implementações em
`apps/api/src/infra/storage/`: `R2Storage` (Cloudflare R2 via `@aws-sdk/client-s3` +
`s3-request-presigner`, wrapper mínimo/conformista) e `LocalStorage` (dev). A escolha é da
composição: as 4 vars `R2_*` presentes ⇒ R2; ausentes ⇒ disco em `STORAGE_LOCAL_DIR`
(default `.storage`, no `.gitignore`). No modo local a "URL pré-assinada" aponta para
`PUT /storage/local/:storageKey` da própria API, assinada por HMAC com `BETTER_AUTH_SECRET`
(assinatura + expiração + proteção de path traversal); essa rota só é registrada no modo local.

**Consequências:** a fatia é demonstrável sem credencial e o caminho de produção existe.
Em troca, é uma exceção consciente à regra "sem interface com uma implementação só" — aqui
há duas de verdade — e o `R2Storage` segue **não verificado contra o R2 real** (PUT aceito
pelo bucket, CORS do bucket e `ContentType` no R2). `size_bytes` é o declarado pelo cliente:
a URL pré-assinada não assina `Content-Length` (teto anotado em `file-rules.ts`).

**Alternativas rejeitadas:** só R2 (bloqueia o dev sem bucket, contra "cada fatia é
demonstrável"); só disco (deixa a hipótese central — upload direto, egress grátis — não provada).

## D13 — Responsável com senha, e Competência só para quem configurou o acesso

**Contexto:** a Fase 10 decidiu que o Responsável entra **sem senha** — passkey com magic
link como plano B — e que a conta nasce do próprio Link de Upload. Na primeira vez que o
fluxo foi montado ponta a ponta na tela (2026-09-07), ficou claro que isso não se sustenta
na prática: "criar meu acesso" só criava o vínculo, e para de fato entrar o Responsável
tinha de **pedir outro email** (magic link) segundos depois de já ter clicado num link que
chegou por email. Dois emails para uma entrada. Pior: nenhuma tela registrava passkey, então
o login por biometria nunca teria credencial para usar.

Também apareceu o outro lado: o Link de Upload era enviado para qualquer Empresa ativa com
email, mesmo que ninguém daquele endereço tivesse confirmado nada. Cobrança de documento
saindo para email não confirmado.

**Decisão:**

1. **O Responsável tem senha.** O convite de acesso (`invite.company_id`, que já existia no
   schema e respondia 501) leva a uma tela onde ele define a senha e **entra na hora**. A
   entrada normal passa a ser email+senha.
2. **Passkey é opcional e posterior**, oferecida dentro da área logada ("quer entrar por
   biometria na próxima vez?") — é o único lugar em que dá para registrar a credencial, já
   que o registro exige sessão.
3. **Magic link vira recuperação** ("esqueci minha senha"), não a porta de entrada.
4. **A Competência só cobra Empresa com Responsável configurado** — cadastrado _e_ com
   acesso criado. As outras não geram Solicitação: viram aviso nomeando o motivo
   (`blockedBy: 'contact' | 'access'`), porque a ação do Contador é diferente em cada caso.
5. **O cadastro da Empresa não pede documento.** O convite de acesso tem um trabalho só; a
   cobrança sai depois, na abertura da Competência.
6. **Os dois caminhos de cadastro criam conta com senha** (convite da Empresa e o antigo
   `POST /upload/:token/account`) — duas portas com garantias diferentes seriam duas contas
   com garantias diferentes.

**Consequências:** a entrada do Responsável fica em um passo e não depende de o email de
magic link chegar. Em troca, o Contador **não abre a competência** até o Responsável criar
o acesso — é uma trava real, e a tela precisa (e passou a) mostrar quem está travado, com
reenvio de convite. O botão "criar meu acesso" da página pública de envio ficou
inalcançável (quem recebe Link já configurou o acesso) e foi removido da UI. Todo teste que
abre competência passou a criar o acesso antes: o factory `createCompany` faz isso por
padrão, e quem testa a trava pede `access: false`.

**Alternativas rejeitadas:** manter sem senha e só melhorar a tela (não resolve — a fricção
é o segundo email, não o texto); cobrar Empresa com Responsável não configurado e apenas
avisar (deixa documento indo para endereço que ninguém confirmou); criar a sessão dentro da
rota de aceite (a sessão nasceria de um link que circula por email — mantivemos o login
explícito em seguida, invisível na tela, um passo só para o usuário).

## D14 — Conta do Responsável é opcional; push não depende de conta

**Contexto:** a D13 (2026-09-07) tornou a conta do Responsável **obrigatória** — a
Competência só gera Solicitação para Empresa cujo Responsável já criou acesso
(`blockedBy: 'access'`). Ao revisar o negócio no mesmo dia, isso se mostrou incompatível
com a proposta que o produto vende:

1. O posicionamento é "seu cliente não precisa de conta" (`product.md`: link sem senha é o
   diferencial e a hipótese 🔴 nº 2 do discovery). Exigir conta antes do primeiro documento
   vende a mesma coisa que Acessórias/Onvio — um portal.
2. A trava é sobre a pessoa errada. Quem paga é o Contador, e ele passa a **esperar** a ação
   de um terceiro para abrir a competência. O medo de "cliente aporrinhando o contador por
   acesso" se materializa invertido: o contador cobra o cliente por uma conta que não serve
   para enviar documento.
3. O Link de Upload que chega por email **já prova posse da caixa** — mesma força de um
   magic link. Trocar uma credencial que funciona por uma senha usada 1×/mês é regressão.

Junto veio a pergunta técnica que fecha a decisão: se o único jeito de notificar é email ou
push, e push exige saber para quem mandar, a conta não seria obrigatória para push? **Não.**
`push_subscription` precisa de `contact_id` + endpoint do aparelho, e o `UploadTokenGuard`
já resolve o `contact` a partir do token do link. Push exige **service worker na mesma
origem**, não sessão.

**Decisão:**

1. **A conta do Responsável é opcional e nunca é pré-requisito de nada.** O Link de Upload
   é a única porta de entrada obrigatória do produto, para sempre.
2. **Reverte o item 4 da D13:** o fan-out volta a cobrar Empresa ativa **com email de
   Responsável**. `blockedBy: 'contact'` permanece (Empresa sem Responsável não pode ser
   cobrada); `blockedBy: 'access'` sai.
3. **Push não depende de conta.** A subscription é gravada atrás do `UploadTokenGuard`
   (`POST /upload/:token/push`), com o `contact_id` resolvido pelo token. Como a
   subscription se liga ao `contact` — não à Solicitação — ela sobrevive ao fan-out do mês
   seguinte, que emite um `upload_link` novo.
4. **O que o push vende é o deep link, não o aviso.** O Responsável já é avisado por email;
   o ganho honesto é tocar a notificação e cair direto na tela de envio daquela Competência,
   sem garimpar a caixa de entrada. O ganho do negócio é nosso: cada Responsável em push
   deixa de custar a mensagem de WhatsApp (~R$0,045), o item dominante do custo operacional.
   Email segue sendo o canal que nunca falha (invariante de `messaging` inalterada).
5. **Duas ofertas separadas, ambas depois do sucesso do envio:**
   - **"Ativar avisos neste aparelho"** na tela de sucesso do `/envio/:token` — um toque, sem
     conta. É onde mora o volume. Antes do upload o botão é ignorado (ele quer se livrar da
     tarefa); depois do upload o benefício é legível e é sobre o mês que vem.
   - **"Criar acesso"** discreto na área do Responsável/rodapé. Vende só o que a conta
     realmente entrega: **histórico de Competências anteriores** (o Link de Upload é por
     Solicitação e só mostra o mês dele). Conversão baixa é resultado esperado, não defeito.
6. **"Perdi meu link" na home, não "login como cliente".** Pede email: com acesso → senha;
   sem acesso, mas email de Responsável de Empresa ativa → **reenvia o Link de Upload** (não
   gera login, não notifica o Contador); não reconhecido → mensagem genérica. Resposta e
   tempo idênticos nos três casos (não revela se o email existe), com rate limit.
7. **Senha permanece no produto** — o `emailAndPassword` do Better Auth segue ligado e é
   como o **Contador** entra (não trocamos por passkey-first, que custaria uma tela de
   registro para valor não provado). O que sai é a senha **do Responsável**: ver a
   "Amendment" abaixo.
8. **Regra de triagem para qualquer ideia futura sobre acesso:** se ela cria trabalho ou
   espera para o Contador, está errada. Isso reprova "o Contador gera o link de criação de
   acesso por Empresa" e "notificar o Contador para gerar acesso" — é a aporrinhação
   automatizada. O botão "Convidar para o app" por Empresa no painel pode existir como
   atalho para o Contador que **quer** empurrar, nunca como mecanismo.

**Consequências:** o "sem senha" volta a ser verdade no caminho principal e o Contador abre a
competência sem depender de terceiros. O convite de acesso (`invite.company_id`) deixa de ser
etapa do fluxo e vira ação avulsa. Em troca, o produto passa a ter **duas identidades para o
mesmo Responsável** (token de link e sessão), com o `document.uploaded_by_contact_id`
unificando a autoria — que já era o desenho da Fase 10. E a conversão de conta deixa de ser
funil de onboarding e passa a ser métrica nossa de custo de canal: medir % de Responsáveis
com push ativo e o quanto isso derruba a fatura de WhatsApp.

**Alternativas rejeitadas:** manter a trava da D13 e só melhorar a tela de "quem está
travado" (administra melhor uma obrigação que não deveria existir); email de criação de conta
na criação da Empresa (primeiro contato do cliente com o produto é uma senha, e quebra o
"sem senha" antes de qualquer documento); botão "criar acesso" **antes** do upload na página
pública (passa despercebido — nesse momento ele quer só cumprir a tarefa); exigir conta para
push (tecnicamente desnecessário, como o item 3 mostra).

### Amendment (2026-09-08): a senha vive no convite, não no Link de Upload

Montado ponta a ponta, o item 7 ("senha permanece") e o item 5 ("um toque") não se aplicam
aos dois caminhos de criação de conta da mesma forma, porque os dois links têm **prazos de
validade opostos**:

| Caminho                          | O link                                                           | Sem senha, o Responsável…                             |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Convite (`/convite/:token`)      | **uso único** — depois de aceito responde 409                    | fica sem porta: o único link que ele tem morreu       |
| Link de Upload (`/envio/:token`) | **renovado todo mês** pelo fan-out, e o "perdi meu link" reenvia | nunca fica sem porta: a caixa de email é a credencial |

Então:

1. **O convite pede senha** e o Responsável entra na hora (é a D13 item 1, preservada). É a
   credencial que substitui o link que ele acabou de gastar.
2. **A ativação pelo Link de Upload continua um toque, sem senha** (item 5 intacto) — é
   onde mora o volume, e cobrar ali uma credencial usada 1×/mês seria pagar por um
   problema que aquele caminho não tem.
3. **A tela de entrada oferece as três portas** (senha, passkey, magic link), porque as
   duas formas de conta convivem: esconder qualquer uma deixaria metade dos Responsáveis
   de fora sem explicação.
4. **Convite reaproveitado não é beco sem saída**: o 409 vira "já foi utilizado" com botão
   para a entrada, em vez de erro seco.

O que motivou o acerto: com a conta sem senha nos dois caminhos, reaproveitar o link do
convite (o gesto natural de quem quer "entrar de novo") dava 409 e o Responsável não tinha
nenhuma credencial para usar — só descobrir sozinho a tela de magic link.

**Nota de implementação:** o 409 não aparecia — a tela congelava no esqueleto. No Angular 22
`resource.value()` **lança** (`ResourceValueError`) quando o recurso está em erro, e ler o
valor dentro de `computed`/`linkedSignal` (que rodam independentemente do ramo renderizado)
derrubava a detecção de mudanças. O helper `resourceValue()` em `core/http/api.ts` devolve
`undefined` nesse caso; qualquer leitura de recurso que possa falhar deve passar por ele.

## D15 — Provedor externo é escolhido pelo `NODE_ENV`, não pela credencial

**Contexto:** a D12 escolhia storage por **presença de credencial** (as 4 `R2_*` presentes ⇒
R2), e `messaging` copiou o padrão (`RESEND_API_KEY` presente ⇒ Resend). Isso tem dois
defeitos simétricos:

1. **Em produção falha em silêncio.** Um deploy que esquece uma das `R2_*` sobe feliz e
   grava documento contábil no disco efêmero do container; um que esquece a
   `RESEND_API_KEY` "envia" a cobrança para o log. O modo de falha correto de credencial
   faltando em produção é **não subir**, nomeando a variável.
2. **Em dev vazava para o provedor real.** Quem tinha uma chave da Resend no `.env` local
   passava a mandar email de verdade a partir de um teste manual, e o remendo para isso
   (`EMAIL_DEV_RECIPIENT` redirecionando todo email, mais um `if (NODE_ENV ===
'development') console.log(...)` dentro do próprio provedor da Resend) era mais
   máquina do que o problema.

**Decisão:** a escolha é do **`NODE_ENV`**. Em `development`/`test`, **nenhum provedor
externo é usado** — storage em disco (`STORAGE_LOCAL_DIR`), email no console (`LogEmail`),
push no console. Em `production`, todos são os de verdade, e `config/env.ts` **derruba a
subida** listando cada variável de provedor ausente (`R2_*`, `RESEND_API_KEY`,
`EMAIL_FROM`). VAPID segue opcional até em produção: sem chave, o push cai no log — push é
canal secundário, email é o que nunca falha.

**Consequências:** `git clone` + `pnpm --filter api start:dev` funciona sem nenhuma
credencial, e o email inteiro (remetente, destinatário real, assunto, corpo) aparece no
console — que é a razão de o desvio de destinatário ter deixado de existir. Em troca,
testar a Resend ou o R2 de verdade exige `NODE_ENV=production` local, com o env completo.
A D12 continua valendo no que importa (as duas implementações de `StorageProvider`, a URL
pré-assinada local assinada por HMAC); o que ela definia e foi substituído é só o
**mecanismo de escolha**.

**Alternativas rejeitadas:** manter a escolha por credencial e só exigir as variáveis em
produção (metade da correção: dev com chave no `.env` continua mandando email real); uma
env própria (`USE_REAL_PROVIDERS`) para ligar/desligar (segundo eixo de configuração para
dizer o que o `NODE_ENV` já diz).

# Baseline visual do apps/web (Vue) — 2026-11

Capturado em 2026-11-07 a partir de `origin/main` (`1d982b7`), antes de qualquer código da migração para React (COM-314 / M0.1). Toda tela do `apps/web-react` é comparada com estas imagens antes de fechar o ticket.

117 imagens: desktop 1440×900 e mobile 390×844, `deviceScaleFactor: 2`, página inteira, Chrome do sistema via Playwright.

## Como reproduzir

1. Postgres do `apps/api/docker-compose.yml` no ar (`api-db-1`) e um banco vazio `competa_baseline`:
   `docker exec api-db-1 psql -U postgres -c "create database competa_baseline"`.
2. `apps/api/.env` a partir do `.env.template` com `NODE_ENV=development`, `PORT=3100`, `DB_USER=postgres`, `DB_NAME=competa_baseline`, `BETTER_AUTH_URL=http://localhost:3100` e um `BETTER_AUTH_SECRET` qualquer. Nenhum provedor externo: e-mail no console, storage em disco.
3. `pnpm --filter api db:migrate && pnpm --filter api db:seed` e `pnpm --filter api create-firm --name "Contabilidade Exemplo" --email dono@exemplo.com.br` (anote o token do convite).
4. API: `cd apps/api && pnpm exec tsx src/main.ts > /tmp/api.log`. Web: `apps/web/.env.local` com `VITE_API_URL=http://localhost:3100` e `VITE_AUTH_URL=http://localhost:3100/api/auth`, depois `pnpm --filter web exec vite --port 5173`.
5. `API_LOG=/tmp/api.log INVITE_TOKEN=<token> CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" apps/api/node_modules/.bin/tsx docs/qa/baseline-vue-2026-11/capture.ts`.

O script monta a cena e captura na mesma passada, na ordem exigida (as capturas vazias de `/competencias` e `/empresas` saem logo depois do aceite do convite inicial). Para o React (M10.2), troque `WEB_URL` e `OUT_DIR`.

## Dados de cena

- Dono: Ana Dono (`dono@exemplo.com.br`), via `POST /auth/sign-up` com o convite do `create-firm`. Membro: Bruno Membro, convidado pela API e aceito em outro contexto do navegador.
- Empresas: Padaria Pão Quente (sem Responsável nem template; desativada antes da captura de Inativas), Mercado Bom Preço (1 Responsável, CNPJ, com funcionários), Oficina Roda Viva (2 Responsáveis, override `add` de um tipo fora do template, depois atribuída ao membro para o filtro por contador). Template do produto aplicado às duas últimas.
- Template derivado "Modelo do escritório" com o prazo do primeiro item mudado para o dia 15.
- Competência do mês corrente com prazo em 5 dias. No link do Mercado: um PDF e uma imagem em Itens e um documento extra, enviados pela API de upload (presign → PUT → confirm). Revisão: primeiro Item aceito, segundo rejeitado com motivo; link reenviado.
- **Mensagem com erro:** em `development` nenhum canal falha, então o script marca uma mensagem da Oficina como `failed` com um texto de erro direto no banco (`update message …`). É o único dado que não vem da UI ou da API.
- Responsável com conta: "Ativar acesso" pelo link do Mercado e o magic link impresso no log da API.
- A planilha importada (`empresas.csv`) tem uma linha válida e uma com CNPJ inválido; a captura "relatorio" confirma a importação, e o Vue volta para `/empresas`.

## Diferenças conhecidas do Prompt C

- `/mensagens`: o Vue mantém os filtros no estado local (não na URL) e mostra o erro em linha, sem "abrir". Os estados viraram "com-filtro" (Empresa + canal) e "linha-com-erro". Com 6 mensagens não há página 2.
- `/empresas`: "Inativas" é uma pílula de filtro, não uma aba.
- `/minha-area/pendencias` vazio não foi capturado: o Responsável da cena tem pendências.
- A porta da API é 3100 (não 3000), para não colidir com um `pnpm dev` aberto.

## Imagens

| arquivo                                                  | rota                                   | viewport | estado             | o que observar                                                               |
| -------------------------------------------------------- | -------------------------------------- | -------- | ------------------ | ---------------------------------------------------------------------------- |
| entrar__desktop__inicial.png                             | `/entrar`                              | desktop  | inicial            | campos e-mail/senha, link "Esqueci minha senha", link para cadastro          |
| entrar__mobile__inicial.png                              | `/entrar`                              | mobile   | inicial            | campos e-mail/senha, link "Esqueci minha senha", link para cadastro          |
| cadastro__desktop__passo-1.png                           | `/cadastro`                            | desktop  | passo-1            | passo 1 de 2: dados do Contador, consentimento dos Termos                    |
| cadastro__mobile__passo-1.png                            | `/cadastro`                            | mobile   | passo-1            | passo 1 de 2: dados do Contador, consentimento dos Termos                    |
| cadastro__desktop__passo-2.png                           | `/cadastro`                            | desktop  | passo-2            | passo 2 de 2: dados da Contabilidade (nome, CNPJ opcional)                   |
| cadastro__mobile__passo-2.png                            | `/cadastro`                            | mobile   | passo-2            | passo 2 de 2: dados da Contabilidade (nome, CNPJ opcional)                   |
| esqueci-senha__desktop__inicial.png                      | `/esqueci-senha`                       | desktop  | inicial            | campo de e-mail e botão de enviar                                            |
| esqueci-senha__mobile__inicial.png                       | `/esqueci-senha`                       | mobile   | inicial            | campo de e-mail e botão de enviar                                            |
| esqueci-senha__desktop__enviado.png                      | `/esqueci-senha`                       | desktop  | enviado            | confirmação cega de envio                                                    |
| esqueci-senha__mobile__enviado.png                       | `/esqueci-senha`                       | mobile   | enviado            | confirmação cega de envio                                                    |
| redefinir-senha__desktop__invalido.png                   | `/redefinir-senha?token=x`             | desktop  | invalido           | "Link inválido" ao submeter token adulterado                                 |
| redefinir-senha__mobile__invalido.png                    | `/redefinir-senha?token=x`             | mobile   | invalido           | "Link inválido" ao submeter token adulterado                                 |
| termos__desktop__inicial.png                             | `/termos`                              | desktop  | inicial            | texto dos Termos de Uso                                                      |
| termos__mobile__inicial.png                              | `/termos`                              | mobile   | inicial            | texto dos Termos de Uso                                                      |
| privacidade__desktop__inicial.png                        | `/privacidade`                         | desktop  | inicial            | texto da Política de Privacidade                                             |
| privacidade__mobile__inicial.png                         | `/privacidade`                         | mobile   | inicial            | texto da Política de Privacidade                                             |
| 404__desktop__inicial.png                                | `/nao-existe`                          | desktop  | inicial            | página 404 com link de volta                                                 |
| 404__mobile__inicial.png                                 | `/nao-existe`                          | mobile   | inicial            | página 404 com link de volta                                                 |
| perdi-meu-link__desktop__inicial.png                     | `/perdi-meu-link`                      | desktop  | inicial            | campo de e-mail do Responsável                                               |
| perdi-meu-link__mobile__inicial.png                      | `/perdi-meu-link`                      | mobile   | inicial            | campo de e-mail do Responsável                                               |
| perdi-meu-link__desktop__enviado.png                     | `/perdi-meu-link`                      | desktop  | enviado            | resposta cega "se houver…"                                                   |
| perdi-meu-link__mobile__enviado.png                      | `/perdi-meu-link`                      | mobile   | enviado            | resposta cega "se houver…"                                                   |
| perdi-meu-link-confirmar__desktop__inicial.png           | `/perdi-meu-link/confirmar?token=x`    | desktop  | inicial            | botão de confirmação (API só no clique)                                      |
| perdi-meu-link-confirmar__mobile__inicial.png            | `/perdi-meu-link/confirmar?token=x`    | mobile   | inicial            | botão de confirmação (API só no clique)                                      |
| envio-token-invalido__desktop__invalido.png              | `/envio/token-invalido`                | desktop  | invalido           | link expirado/inválido levando ao "Perdi meu link"                           |
| envio-token-invalido__mobile__invalido.png               | `/envio/token-invalido`                | mobile   | invalido           | link expirado/inválido levando ao "Perdi meu link"                           |
| minha-area-acesso__desktop__inicial.png                  | `/minha-area/acesso`                   | desktop  | inicial            | entrada do Responsável: senha e link por e-mail                              |
| minha-area-acesso__mobile__inicial.png                   | `/minha-area/acesso`                   | mobile   | inicial            | entrada do Responsável: senha e link por e-mail                              |
| minha-area-acesso__desktop__link-enviado.png             | `/minha-area/acesso`                   | desktop  | link-enviado       | confirmação do link mágico enviado                                           |
| minha-area-acesso__mobile__link-enviado.png              | `/minha-area/acesso`                   | mobile   | link-enviado       | confirmação do link mágico enviado                                           |
| competencias__desktop__vazio.png                         | `/competencias`                        | desktop  | vazio              | estado vazio antes de abrir qualquer competência; KPIs zerados               |
| competencias__mobile__vazio.png                          | `/competencias`                        | mobile   | vazio              | estado vazio antes de abrir qualquer competência; KPIs zerados               |
| empresas__desktop__vazio.png                             | `/empresas`                            | desktop  | vazio              | estado vazio com chamada para cadastrar/importar                             |
| empresas__mobile__vazio.png                              | `/empresas`                            | mobile   | vazio              | estado vazio com chamada para cadastrar/importar                             |
| competencias__desktop__modal-abertura.png                | `/competencias`                        | desktop  | modal-abertura     | modal "Abrir competência" com prévia do fan-out                              |
| competencias__mobile__modal-abertura.png                 | `/competencias`                        | mobile   | modal-abertura     | modal "Abrir competência" com prévia do fan-out                              |
| envio-token__desktop__com-pendencias.png                 | `/envio/:token`                        | desktop  | com-pendencias     | itens pendentes com prazo, área de envio, extras                             |
| envio-token__mobile__com-pendencias.png                  | `/envio/:token`                        | mobile   | com-pendencias     | itens pendentes com prazo, área de envio, extras                             |
| solicitacoes-id__desktop__com-pendentes.png              | `/solicitacoes/:id`                    | desktop  | com-pendentes      | documentos aguardando revisão, extras, aceitar/rejeitar                      |
| solicitacoes-id__mobile__com-pendentes.png               | `/solicitacoes/:id`                    | mobile   | com-pendentes      | documentos aguardando revisão, extras, aceitar/rejeitar                      |
| solicitacoes-id__desktop__com-rejeicao.png               | `/solicitacoes/:id`                    | desktop  | com-rejeicao       | item aceito, item rejeitado com motivo, extras                               |
| solicitacoes-id__mobile__com-rejeicao.png                | `/solicitacoes/:id`                    | mobile   | com-rejeicao       | item aceito, item rejeitado com motivo, extras                               |
| envio-token__desktop__com-rejeicao.png                   | `/envio/:token`                        | desktop  | com-rejeicao       | pílula de rejeição com motivo, item aprovado                                 |
| envio-token__mobile__com-rejeicao.png                    | `/envio/:token`                        | mobile   | com-rejeicao       | pílula de rejeição com motivo, item aprovado                                 |
| envio-token__desktop__sucesso-ofertas.png                | `/envio/:token`                        | desktop  | sucesso-ofertas    | feedback de envio e ofertas "Ativar avisos"/"Ativar acesso"                  |
| envio-token__mobile__sucesso-ofertas.png                 | `/envio/:token`                        | mobile   | sucesso-ofertas    | feedback de envio e ofertas "Ativar avisos"/"Ativar acesso"                  |
| competencias-id-pendencias__desktop__com-dados.png       | `/competencias/:id/pendencias`         | desktop  | com-dados          | quem faltou por Empresa, ações copiar/reenviar, falhas de canal              |
| competencias-id-pendencias__mobile__com-dados.png        | `/competencias/:id/pendencias`         | mobile   | com-dados          | quem faltou por Empresa, ações copiar/reenviar, falhas de canal              |
| convite-token__desktop__contador.png                     | `/convite/:token`                      | desktop  | contador           | aceite do convite do segundo Contador                                        |
| convite-token__mobile__contador.png                      | `/convite/:token`                      | mobile   | contador           | aceite do convite do segundo Contador                                        |
| competencias__desktop__com-dados.png                     | `/competencias`                        | desktop  | com-dados          | KPIs, tabela paginada, ações de zip e pendências                             |
| competencias__mobile__com-dados.png                      | `/competencias`                        | mobile   | com-dados          | KPIs, tabela paginada, ações de zip e pendências                             |
| competencias__mobile__menu-aberto.png                    | `/competencias`                        | mobile   | menu-aberto        | menu lateral aberto no mobile                                                |
| empresas__desktop__com-dados.png                         | `/empresas`                            | desktop  | com-dados          | lista, filtros, colunas Responsável/Template/Status                          |
| empresas__mobile__com-dados.png                          | `/empresas`                            | mobile   | com-dados          | lista, filtros, colunas Responsável/Template/Status                          |
| empresas__desktop__inativas.png                          | `/empresas`                            | desktop  | inativas           | filtro Inativas com a Empresa desativada                                     |
| empresas__mobile__inativas.png                           | `/empresas`                            | mobile   | inativas           | filtro Inativas com a Empresa desativada                                     |
| empresas__desktop__com-selecao.png                       | `/empresas`                            | desktop  | com-selecao        | seleção em lote e barra de ações                                             |
| empresas__mobile__com-selecao.png                        | `/empresas`                            | mobile   | com-selecao        | seleção em lote e barra de ações                                             |
| empresas-nova__desktop__inicial.png                      | `/empresas/nova`                       | desktop  | inicial            | formulário de nova Empresa, Responsável, prévia do checklist                 |
| empresas-nova__mobile__inicial.png                       | `/empresas/nova`                       | mobile   | inicial            | formulário de nova Empresa, Responsável, prévia do checklist                 |
| empresas-id-editar__desktop__dois-responsaveis.png       | `/empresas/:id/editar`                 | desktop  | dois-responsaveis  | Empresa com dois Responsáveis, revogar acesso, desativar                     |
| empresas-id-editar__mobile__dois-responsaveis.png        | `/empresas/:id/editar`                 | mobile   | dois-responsaveis  | Empresa com dois Responsáveis, revogar acesso, desativar                     |
| empresas-id-checklist__desktop__com-override.png         | `/empresas/:id/checklist`              | desktop  | com-override       | checklist efetivo com item adicionado por override                           |
| empresas-id-checklist__mobile__com-override.png          | `/empresas/:id/checklist`              | mobile   | com-override       | checklist efetivo com item adicionado por override                           |
| empresas-id-checklist__desktop__picker-aberto.png        | `/empresas/:id/checklist`              | desktop  | picker-aberto      | CatalogPicker aberto                                                         |
| empresas-id-checklist__mobile__picker-aberto.png         | `/empresas/:id/checklist`              | mobile   | picker-aberto      | CatalogPicker aberto                                                         |
| empresas-importar__desktop__inicial.png                  | `/empresas/importar`                   | desktop  | inicial            | dropzone, modelo de planilha                                                 |
| empresas-importar__mobile__inicial.png                   | `/empresas/importar`                   | mobile   | inicial            | dropzone, modelo de planilha                                                 |
| empresas-importar__desktop__previa-com-erro.png          | `/empresas/importar`                   | desktop  | previa-com-erro    | prévia por linha com uma linha em erro                                       |
| empresas-importar__mobile__previa-com-erro.png           | `/empresas/importar`                   | mobile   | previa-com-erro    | prévia por linha com uma linha em erro                                       |
| empresas-importar__desktop__relatorio.png                | `/empresas/importar`                   | desktop  | relatorio          | após confirmar, volta para /empresas com as importadas e o aviso de convites |
| empresas-importar__mobile__relatorio.png                 | `/empresas/importar`                   | mobile   | relatorio          | após confirmar, volta para /empresas com as importadas e o aviso de convites |
| templates__desktop__com-dados.png                        | `/templates`                           | desktop  | com-dados          | templates do produto e o derivado                                            |
| templates__mobile__com-dados.png                         | `/templates`                           | mobile   | com-dados          | templates do produto e o derivado                                            |
| templates-id__desktop__produto.png                       | `/templates/:id`                       | desktop  | produto            | template do produto somente leitura, ação de derivar                         |
| templates-id__mobile__produto.png                        | `/templates/:id`                       | mobile   | produto            | template do produto somente leitura, ação de derivar                         |
| templates-id__desktop__derivado-em-edicao.png            | `/templates/:id`                       | desktop  | derivado-em-edicao | derivado com um item em edição                                               |
| templates-id__mobile__derivado-em-edicao.png             | `/templates/:id`                       | mobile   | derivado-em-edicao | derivado com um item em edição                                               |
| templates-id__desktop__dialogo-sair.png                  | `/templates/:id`                       | desktop  | dialogo-sair       | diálogo "sair sem salvar"                                                    |
| templates-id__mobile__dialogo-sair.png                   | `/templates/:id`                       | mobile   | dialogo-sair       | diálogo "sair sem salvar"                                                    |
| mensagens__desktop__sem-filtro.png                       | `/mensagens`                           | desktop  | sem-filtro         | log com data, Empresa, tipo, canal, destinatário, status                     |
| mensagens__mobile__sem-filtro.png                        | `/mensagens`                           | mobile   | sem-filtro         | log com data, Empresa, tipo, canal, destinatário, status                     |
| mensagens__desktop__com-filtro.png                       | `/mensagens`                           | desktop  | com-filtro         | filtros de Empresa e canal aplicados                                         |
| mensagens__mobile__com-filtro.png                        | `/mensagens`                           | mobile   | com-filtro         | filtros de Empresa e canal aplicados                                         |
| mensagens__desktop__linha-com-erro.png                   | `/mensagens`                           | desktop  | linha-com-erro     | pílula de falha com o texto do erro abaixo e ação de reenviar                |
| mensagens__mobile__linha-com-erro.png                    | `/mensagens`                           | mobile   | linha-com-erro     | pílula de falha com o texto do erro abaixo e ação de reenviar                |
| configuracoes-contabilidade__desktop__dono.png           | `/configuracoes/contabilidade`         | desktop  | dono               | dados da Contabilidade editáveis e lembretes                                 |
| configuracoes-contabilidade__mobile__dono.png            | `/configuracoes/contabilidade`         | mobile   | dono               | dados da Contabilidade editáveis e lembretes                                 |
| configuracoes-contadores__desktop__convite-pendente.png  | `/configuracoes/contadores`            | desktop  | convite-pendente   | equipe e convite pendente                                                    |
| configuracoes-contadores__mobile__convite-pendente.png   | `/configuracoes/contadores`            | mobile   | convite-pendente   | equipe e convite pendente                                                    |
| configuracoes-contadores__desktop__form-convite.png      | `/configuracoes/contadores`            | desktop  | form-convite       | formulário de convite aberto                                                 |
| configuracoes-contadores__mobile__form-convite.png       | `/configuracoes/contadores`            | mobile   | form-convite       | formulário de convite aberto                                                 |
| configuracoes-whatsapp__desktop__dono.png                | `/configuracoes/whatsapp`              | desktop  | dono               | status e ação de conectar                                                    |
| configuracoes-whatsapp__mobile__dono.png                 | `/configuracoes/whatsapp`              | mobile   | dono               | status e ação de conectar                                                    |
| configuracoes-plano__desktop__trial.png                  | `/configuracoes/plano`                 | desktop  | trial              | trial ativo, ciclo e planos                                                  |
| configuracoes-plano__mobile__trial.png                   | `/configuracoes/plano`                 | mobile   | trial              | trial ativo, ciclo e planos                                                  |
| configuracoes-plano__desktop__plano-essencial.png        | `/configuracoes/plano?plano=essencial` | desktop  | plano-essencial    | plano pré-selecionado pela URL                                               |
| configuracoes-plano__mobile__plano-essencial.png         | `/configuracoes/plano?plano=essencial` | mobile   | plano-essencial    | plano pré-selecionado pela URL                                               |
| configuracoes-contabilidade__desktop__membro.png         | `/configuracoes/contabilidade`         | desktop  | membro             | somente leitura para membro                                                  |
| configuracoes-contabilidade__mobile__membro.png          | `/configuracoes/contabilidade`         | mobile   | membro             | somente leitura para membro                                                  |
| configuracoes-plano__desktop__membro.png                 | `/configuracoes/plano`                 | desktop  | membro             | somente leitura para membro                                                  |
| configuracoes-plano__mobile__membro.png                  | `/configuracoes/plano`                 | mobile   | membro             | somente leitura para membro                                                  |
| configuracoes-whatsapp__desktop__membro.png              | `/configuracoes/whatsapp`              | desktop  | membro             | somente leitura para membro                                                  |
| configuracoes-whatsapp__mobile__membro.png               | `/configuracoes/whatsapp`              | mobile   | membro             | somente leitura para membro                                                  |
| competencias-id-pendencias__desktop__filtro-contador.png | `/competencias/:id/pendencias`         | desktop  | filtro-contador    | filtro por contador aplicado                                                 |
| competencias-id-pendencias__mobile__filtro-contador.png  | `/competencias/:id/pendencias`         | mobile   | filtro-contador    | filtro por contador aplicado                                                 |
| minha-area-definir-senha__desktop__inicial.png           | `/minha-area/definir-senha`            | desktop  | inicial            | criar senha do Responsável                                                   |
| minha-area-definir-senha__mobile__inicial.png            | `/minha-area/definir-senha`            | mobile   | inicial            | criar senha do Responsável                                                   |
| minha-area-pendencias__desktop__com-pendencias.png       | `/minha-area/pendencias`               | desktop  | com-pendencias     | itens agrupados por Empresa/Competência                                      |
| minha-area-pendencias__mobile__com-pendencias.png        | `/minha-area/pendencias`               | mobile   | com-pendencias     | itens agrupados por Empresa/Competência                                      |
| minha-area-competencias__desktop__lista.png              | `/minha-area/competencias`             | desktop  | lista              | competências paginadas                                                       |
| minha-area-competencias__mobile__lista.png               | `/minha-area/competencias`             | mobile   | lista              | competências paginadas                                                       |
| minha-area-competencias__desktop__periodo-expandido.png  | `/minha-area/competencias`             | desktop  | periodo-expandido  | detalhe por Empresa expandido                                                |
| minha-area-competencias__mobile__periodo-expandido.png   | `/minha-area/competencias`             | mobile   | periodo-expandido  | detalhe por Empresa expandido                                                |
| minha-area-competencias__desktop__preview-aberto.png     | `/minha-area/competencias`             | desktop  | preview-aberto     | preview de documento aberto                                                  |
| minha-area-competencias__mobile__preview-aberto.png      | `/minha-area/competencias`             | mobile   | preview-aberto     | preview de documento aberto                                                  |

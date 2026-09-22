# Fluxos de Usuário — Competa

Este documento mapeia detalhadamente todos os fluxos possíveis que os usuários (Contador e Responsável) podem realizar na aplicação, descritos passo a passo.

## 1. Acesso e Autenticação do Contador

- O Contador acessa a página `/entrar`.
- Digita seu endereço de e-mail no campo "E-mail".
- Digita sua senha no campo "Senha".
- Clica no botão "Entrar".
- O sistema valida as credenciais e redireciona o usuário para o painel principal (`/competencias` ou `/empresas`).

## 2. Convite de Novo Contador (Membro da Equipe)

- O Contador Dono faz login e acessa o painel.
- Navega pelo menu lateral/superior até `/configuracoes`.
- Acessa a aba "Contadores".
- Clica no botão "Convidar Contador".
- Digita o e-mail do novo membro e confirma a ação.
- O sistema dispara um e-mail com um link de convite.
- O novo Contador acessa sua caixa de e-mail e clica no link recebido.
- É redirecionado para a tela de aceite (`/convite/:token`).
- Na tela, preenche seus dados (como Nome) e define sua senha pessoal.
- Clica no botão para finalizar o cadastro e aceitar o convite.
- O sistema redireciona o novo Contador para a tela de login (`/entrar`) ou o autentica automaticamente no painel.

## 3. Reset de Senha (Contador)

- O Contador acessa a página `/entrar`.
- Clica no link "Esqueci minha senha".
- O sistema abre a rota `/esqueci-senha`.
- O Contador digita seu e-mail de cadastro e clica no botão para solicitar redefinição.
- O sistema exibe mensagem de sucesso cega (sempre exibe para evitar vazamento de dados).
- O Contador acessa sua caixa de e-mail e clica no link recebido (token válido por 1h).
- O navegador abre a rota `/redefinir-senha`.
- O Contador digita a nova senha e a confirmação da senha.
- Clica no botão para salvar a nova senha.
- O sistema redireciona o usuário para `/entrar`, onde ele refaz o login.

## 4. Cadastro de Empresa (Contador)

- O Contador acessa a aba de empresas no painel (`/empresas`).
- Clica no botão "Nova Empresa".
- O sistema exibe o formulário de cadastro (`/empresas/nova`).
- O Contador preenche "Razão Social" e "E-mail do Responsável" (obrigatórios para receber link).
- Preenche opcionalmente telefone e outros dados de contato.
- Seleciona em um menu suspenso o template de checklist aplicável àquela empresa (ex: Simples Nacional, MEI).
- O sistema exibe a prévia dos documentos exigidos (checklist efetivo).
- O Contador clica no botão "Salvar".
- A empresa passa a constar na lista principal.

## 5. Edição de Empresa e Overrides (Contador)

- O Contador acessa a lista de empresas (`/empresas`).
- Clica sobre o nome ou no ícone de edição da empresa desejada (`/empresas/:id/editar`).
- Para alterar dados cadastrais, modifica os campos texto e clica em "Salvar".
- Para alterar regras de documentos exclusivos daquela empresa, acessa a aba de checklist da empresa (`/empresas/:id/checklist`).
- Clica em adicionar documento (adiciona um item extra fora do padrão) ou clica no ícone de exclusão para remover um item que consta no template original (criando um _override_).
- Clica no botão "Salvar".

## 6. Importação de Empresas em Lote (Contador)

- O Contador acessa a rota `/empresas/importar`.
- O sistema exibe uma área de upload.
- O Contador seleciona e envia um arquivo de planilha (`.csv` ou `.xlsx`) com os cabeçalhos reconhecidos (Razão Social, E-mail do responsável, etc.).
- Clica no botão de importação.
- O sistema processa as linhas e exibe um relatório com o status de cada uma.
- Se houver erros (como e-mail inválido ou dados duplicados), as linhas problemáticas são apontadas para que o Contador as corrija no próprio painel e reenvie, ou ignore-as e confirme a importação do restante.

## 7. Configuração de Checklist (Templates Globais)

- O Contador acessa a área de templates (`/checklists`).
- Clica no botão para criar um novo checklist ou seleciona um template existente (`/checklists/:id`).
- Define ou altera o nome do template.
- Seleciona a partir do Catálogo de Documentos quais tipos farão parte desse template.
- Clica no botão "Salvar".
- O template passa a ficar disponível no select ao cadastrar ou editar empresas.

## 8. Mudança de Configurações da Contabilidade (Contador Dono)

- O Contador Dono acessa `/configuracoes`.
- Na aba "Contabilidade", pode alterar o Nome da Contabilidade ou e-mail de contato, clicando em seguida em "Salvar".
- Na aba "Lembretes", ajusta configurações de cobrança automática (como quantos dias de antecedência para enviar lembrete, intervalo entre lembretes e limite) e salva.
- Na aba "Canais", visualiza o status e/ou configura a integração do WhatsApp da agência.

## 9. Ciclo da Competência: Abertura (Envio de Solicitações)

- O Contador acessa `/competencias`.
- Clica no botão "Abrir competência".
- O sistema exibe um modal perguntando para qual Mês de Referência (Competência) deseja abrir e resume quantas Empresas ativas estão configuradas para receber.
- O Contador clica no botão para confirmar.
- O sistema cria as Solicitações no banco.
- O sistema congela (_snapshot_) a lista de documentos (checklists) com os respectivos prazos baseados no momento da abertura.
- O sistema dispara de forma autônoma o **Link de Upload** (sem senha) via e-mail e WhatsApp para os Responsáveis das Empresas.

## 10. Envio de Documentos pelo Responsável (Fluxo Público via Link)

- O Responsável da Empresa recebe a cobrança por e-mail ou WhatsApp.
- Clica no Link de Upload recebido na mensagem.
- O navegador abre a página pública (`/envio/:token`) projetada primariamente para mobile. Não é exigida senha.
- O Responsável visualiza na tela os Itens pendentes (documentos faltantes) e o prazo de cada um.
- Clica no botão de upload de um item específico (ou arrasta o arquivo para a área).
- O arquivo (Imagem, PDF, Zip) sobe direto para a nuvem. O Responsável acompanha a barra de progresso.
- O sistema marca o item como "Enviado" (Submitted) na tela, confirmando visualmente o sucesso.
- Caso precise anexar arquivos não listados no checklist, rola até o final e usa a área de "Documento Extra".

## 11. Criação de Conta / Ativação de Acesso (Responsável - Opcional)

- Após finalizar envios na tela `/envio/:token`, o Responsável chega na tela de sucesso.
- O sistema exibe duas ofertas:
  1. "Ativar avisos neste aparelho" (para permitir Notificações Push locais no navegador, sem criação de conta).
  2. "Ativar acesso" (para acompanhar o histórico e multi-empresas).
- O Responsável clica em "Ativar acesso".
- O sistema gera automaticamente um _magic link_ validando a sessão no fundo sem que o usuário precise digitar senha.
- O Responsável passa a ter acesso logado (`/minha-area/*`), podendo visualizar pendências, histórico e baixar o preview dos documentos já enviados.
- Futuramente, para acessar a plataforma, o Responsável entra em `/minha-area/acesso`, onde pode pedir um _magic link_ no seu e-mail ou logar por _passkey_. (Apenas Responsáveis convidados formalmente via painel, se aplicável, terão senha fixa).

## 12. Fluxo "Perdi Meu Link" (Responsável)

- O Responsável percebe que não acha mais o link no WhatsApp ou E-mail e acessa a página inicial ou pública de resgate (`/perdi-meu-link`).
- Digita o e-mail da sua Empresa e clica em enviar.
- O sistema (para não vazar informações, exibe a mesma mensagem de sucesso independente de existir conta) dispara um e-mail para o endereço contendo um link de "Confirmação de Posse", válido por 30 minutos.
- O Responsável acessa seu e-mail, encontra a mensagem de confirmação e clica no link.
- É levado à tela `/perdi-meu-link/confirmar`.
- Clica no botão manual (para evitar que scanners de vírus ativem acidentalmente o link).
- O sistema rotaciona (invalida o link de upload anterior por segurança) e gera um novo link.
- O sistema dispara imediatamente o novo Link de Upload por E-mail e WhatsApp.

## 13. Revisão de Documentos e Painel de Pendências (Contador)

- O Contador acessa o painel de pendências de uma competência específica (`/competencias/:id`).
- Visualiza a tabela "Quem faltou", focando nas Empresas com itens atrasados ou recém-enviados.
- Clica em uma Empresa específica, abrindo a página de revisão da Solicitação (`/solicitacoes/:id`).
- Visualiza a lista de Itens. Os que foram enviados possuem os arquivos anexados.
- O Contador clica no nome do arquivo e o sistema exibe o _preview_ ou faz o download (se zip/incompatível).
- Se os documentos estiverem corretos: clica no botão verde "Aceitar" para o Item (aprovando em lote todos os anexos daquele item).
- Se os documentos estiverem incorretos ou ilegíveis: avança para o fluxo de rejeição.

## 14. Rejeição e Reenvio de Arquivos (Contador / Responsável)

- Na tela da Solicitação (`/solicitacoes/:id`), o Contador verifica que o documento não atende o padrão.
- Clica no botão vermelho "Rejeitar" do item específico.
- O sistema abre um pequeno campo de texto obrigatório.
- O Contador digita o motivo da rejeição (ex: "Extrato ilegível, enviar sem corte na margem") e clica para confirmar.
- O Item volta para o estado "Pendente" no sistema.
- O sistema dispara um e-mail de aviso imediatamente (apenas por e-mail, conforme regra de domínio) para o Responsável, contendo o motivo da rejeição e o Link de Upload.
- O Responsável acessa o e-mail, clica no link, entra na página `/envio/:token` e visualiza uma _pill_ vermelha no item indicando a rejeição e lendo a justificativa.
- O Responsável escolhe um novo arquivo e faz um novo upload (substituindo a entrega anterior perante o painel).

## 15. Encerramento da Competência e Download (Contador)

- O Contador, após aceitar todos os itens necessários de uma Solicitação (ou optando por encerrar mesmo com pendências para evitar bloqueios de fim de mês), retorna à tela de Solicitação (`/solicitacoes/:id`) ou ao Painel de Pendências.
- Clica no botão "Encerrar" a competência daquela empresa.
- O sistema abre um alerta (se houver pendências). O Contador confirma.
- A Solicitação é dada como finalizada (Status Closed).
- O Contador clica no botão "Baixar Zip".
- O sistema orquestra a coleta de todos os arquivos aceitos no Cloudflare R2 e entrega um único arquivo ZIP organizado, baixado via streaming no navegador do Contador.

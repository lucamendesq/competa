# Integração WhatsApp (Meta Cloud API)

## Variáveis de Ambiente

As seguintes variáveis devem ser configuradas no arquivo `.env` para o funcionamento da integração:

- `META_APP_ID`: ID do aplicativo Meta (necessário para o OAuth / Embedded Signup).
- `META_APP_SECRET`: Segredo do aplicativo Meta (necessário para o OAuth e validação do webhook).
- `META_WEBHOOK_VERIFY_TOKEN`: Token de verificação (string arbitrária) configurado no painel da Meta para assinatura e validação do webhook.
- `META_GRAPH_VERSION`: (Opcional) Versão da API Graph da Meta. Exemplo: `v19.0`. Se não for informada, será assumido `v19.0`.
- `WHATSAPP_CRYPTO_KEY`: Chave de 32 bytes em hexadecimal ou base64 usada pelo `WhatsappCryptoService` para criptografar os tokens de acesso de cada tenant no banco de dados.

## Nota de Arquitetura

### Isolamento de Tenant (Tenant Isolation)

Toda comunicação e configuração referente ao WhatsApp no banco de dados (`whatsapp_integration` e relatórios de envio em `message`) está vinculada estritamente à `accounting_firm_id`. Todas as chamadas para as rotas da API usam o decorador `@CurrentScope()` resolvendo `FirmScope`, que impede que um usuário interaja, consulte ou envie mensagens utilizando as credenciais de outra Contabilidade (tenant).

### Segurança de Credenciais

O token de acesso de longa duração (long-lived / system-user token) recebido via Embedded Signup é sensível, visto que ele permite enviar mensagens tarifadas em nome do cliente. Para protegê-lo:

1. O fluxo OAuth ocorre no backend (troca de código) e o token final nunca é exposto ao frontend (`WhatsappSettingsController.getStatus` não o devolve).
2. O token é salvo criptografado na tabela `whatsapp_integration` usando o `WhatsappCryptoService` e uma chave mantida apenas no `.env` (`WHATSAPP_CRYPTO_KEY`).

### Roteamento de Webhooks

Os webhooks enviados pela Meta (status `delivered`, `read`, `failed`) fornecem o `metaMessageId` e também o ID do número de telefone associado.
A rota de webhook é pública (`@PUBLIC()`), então verificamos:

- A autenticidade pelo `META_WEBHOOK_VERIFY_TOKEN` no desafio (`GET`).
- As atualizações (`POST`) não possuem token de escopo na requisição. Em vez disso, o sistema busca pela mensagem enviada usando o `metaMessageId` gerado no envio original e assim atualiza o seu status (`deliveredAt`, `readAt`, `failedAt`) de forma idempotente, sem vazar informações entre tenants, visto que o ID da mensagem já carrega indiretamente o tenant correspondente na base.

### Ciclo de Vida da Mensagem

1. Uma solicitação de envio invoca o `WhatsappProvider.send()`.
2. Caso o tenant tenha uma integração ativa, o serviço injeta as variáveis no modelo Utility (padrão `competa_test_message` ou outras notificações) e despacha à Meta via `POST /{phone-number-id}/messages`.
3. A API responde com um `messages[0].id` (referido internamente como `metaMessageId`).
4. A base (tabela `message`) salva o registro de envio contendo: `tenantId`, `recipient`, `metaMessageId`, data da solicitação, e `purpose`.
5. Ao longo do tempo, a Meta dispara webhooks atualizando o status dessa mensagem (entregue, lida, falha).
6. O sistema atualiza de forma assíncrona o log local da mensagem, viabilizando métricas e auditoria.

## Guia de Setup / Onboarding para Desenvolvedores

1. **App Meta:** Crie um aplicativo empresarial no Meta for Developers, configure o produto "WhatsApp".
2. **Webhooks:** Vá em Configurações > Webhooks no Meta for Developers e cadastre sua URL (ex: `https://api.competa.com.br/whatsapp/webhook`). Insira o mesmo `META_WEBHOOK_VERIFY_TOKEN` que você declarou nas variáveis de ambiente e marque a assinatura para `messages`.
3. **Embedded Signup:** Siga a documentação para habilitar o fluxo Embedded OAuth. Ajuste a URL permitida para dev/prod.

## Guia do Cliente (Contabilidade)

1. Acesse **Configurações > WhatsApp** no painel da plataforma.
2. Certifique-se de que sua conta e cartão de crédito estão configurados no Facebook/Meta Business Manager, pois a Meta cobrará os envios de mensagens utilitárias diretamente de você.
3. Clique em "Conectar WhatsApp" (o fluxo "Meta Embedded Signup" abrirá). Siga as etapas, selecionando seu WABA e o número de telefone de disparo.
4. Ao final, a página retornará o seu status de conexão.
5. Utilize a ferramenta de **Mensagem de Teste** para verificar o envio e a recepção no seu celular (apenas usuários autenticados da Contabilidade podem enviar testes do seu próprio número configurado).

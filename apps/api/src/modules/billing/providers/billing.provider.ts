import type { BillingCycle } from '@competa/contracts';

export abstract class BillingProvider {
  /** Fora de produção o checkout é um stub de console: a UI precisa dizer isso em vez de
   *  fingir que redirecionou para um pagamento. */
  abstract readonly simulated: boolean;

  /** Obtém ou cria o cliente no gateway. `externalReference` é o id da Contabilidade e é a
   *  CHAVE de busca — não o e-mail. Firma sem e-mail de contato caía num endereço de
   *  fallback compartilhado, e todas elas viravam o mesmo cliente no gateway. */
  abstract getOrCreateCustomer(input: {
    name: string;
    email: string;
    externalReference: string;
    cpfCnpj?: string;
  }): Promise<{ customerId: string }>;

  /** Cria a assinatura e devolve a URL de pagamento DELA (`invoiceUrl` da primeira cobrança
   *  gerada). Link avulso não serve: o pagamento feito nele não carrega o id da assinatura,
   *  e o webhook não teria como ligar um ao outro. */
  abstract createSubscription(input: {
    customerId: string;
    planName: string;
    cycle: BillingCycle;
    value: number; // Valor em reais do ciclo escolhido
    externalReference: string;
  }): Promise<{ subscriptionId: string; checkoutUrl: string }>;

  /** Para de gerar cobranças NOVAS, preservando as já emitidas. É o que a troca de plano
   *  precisa: remover a assinatura apagaria as cobranças pendentes e vencidas dela, e um
   *  boleto em aberto viraria receita perdida. */
  abstract deactivateSubscription(subscriptionId: string): Promise<void>;

  /** Encerra de vez e APAGA as cobranças pendentes/vencidas. Só para o encerramento
   *  deliberado — na troca de plano use `deactivateSubscription`. */
  abstract cancelSubscription(subscriptionId: string): Promise<void>;

  /** Link da cobrança em aberto da assinatura, para o Contador pagar ou trocar a forma de
   *  pagamento NA PÁGINA DO ASAAS. É assim que a troca de cartão acontece sem que dado de
   *  cartão passe por nós — o que nos manteria no escopo do PCI-DSS. */
  abstract pendingInvoiceUrl(subscriptionId: string): Promise<string | null>;
}

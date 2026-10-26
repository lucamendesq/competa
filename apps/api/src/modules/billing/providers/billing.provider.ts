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

  /** Encerra a assinatura no gateway. Sem isto, trocar de plano deixa a anterior viva e o
   *  cliente passa a ser cobrado pelas duas. */
  abstract cancelSubscription(subscriptionId: string): Promise<void>;
}

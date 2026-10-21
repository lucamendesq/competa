import type { BillingCycle } from '@competa/contracts';

export abstract class BillingProvider {
  /** Fora de produção o checkout é um stub de console: a UI precisa dizer isso em vez de
   *  fingir que redirecionou para um pagamento. */
  abstract readonly simulated: boolean;

  /**
   * Obtém ou cria o cliente no gateway de pagamento
   */
  abstract getOrCreateCustomer(input: {
    name: string;
    email: string;
    cpfCnpj?: string;
  }): Promise<{ customerId: string }>;

  /**
   * Cria uma assinatura e retorna a URL de checkout
   */
  abstract createSubscription(input: {
    customerId: string;
    planName: string;
    cycle: BillingCycle;
    value: number; // Valor em reais do ciclo escolhido
  }): Promise<{ subscriptionId: string; checkoutUrl: string }>;
}

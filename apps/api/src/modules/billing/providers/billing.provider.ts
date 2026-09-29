export abstract class BillingProvider {
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
    value: number; // Valor em reais
  }): Promise<{ subscriptionId: string; checkoutUrl: string }>;
}

import { Injectable, Logger } from '@nestjs/common';
import { BillingProvider } from './billing.provider.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class LogBilling implements BillingProvider {
  private readonly logger = new Logger(LogBilling.name);

  async getOrCreateCustomer(input: { name: string; email: string; cpfCnpj?: string }) {
    this.logger.log(`Mock: Criando customer para ${input.name} (${input.email})`);
    return { customerId: `mock_cus_${randomUUID()}` };
  }

  async createSubscription(input: { customerId: string; planName: string; value: number }) {
    this.logger.log(`Mock: Criando assinatura ${input.planName} para ${input.customerId} (R$ ${input.value})`);
    
    return { 
      subscriptionId: `mock_sub_${randomUUID()}`, 
      checkoutUrl: 'https://sandbox.asaas.com/checkout/mock_url' 
    };
  }
}

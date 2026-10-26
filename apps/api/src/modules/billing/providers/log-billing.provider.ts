import { Logger } from '../../../lib/logger.js';
import type { BillingCycle } from '@competa/contracts';
import { BillingProvider } from './billing.provider.js';
import { randomUUID } from 'node:crypto';

export class LogBilling implements BillingProvider {
  readonly simulated = true;
  private readonly logger = new Logger(LogBilling.name);

  async getOrCreateCustomer(input: {
    name: string;
    email: string;
    externalReference: string;
    cpfCnpj?: string;
  }) {
    this.logger.log(`Mock: Criando customer para ${input.name} (${input.externalReference})`);
    return { customerId: `mock_cus_${randomUUID()}` };
  }

  async createSubscription(input: {
    customerId: string;
    planName: string;
    cycle: BillingCycle;
    value: number;
    externalReference: string;
  }) {
    this.logger.log(
      `Mock: Criando assinatura ${input.planName} ${input.cycle} para ${input.customerId} ` +
        `(R$ ${input.value})`,
    );

    return { subscriptionId: `mock_sub_${randomUUID()}`, checkoutUrl: '' };
  }

  async cancelSubscription(subscriptionId: string) {
    this.logger.log(`Mock: Cancelando assinatura ${subscriptionId}`);
  }
}

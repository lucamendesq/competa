import { Controller, Post } from '@nestjs/common';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { BillingProvider } from './providers/billing.provider.js';
import { AccountantRepository } from '../auth/accountant.repository.js';
import { SubscriptionRepository } from './subscription.repository.js';

const PLAN_RATES = {
  essencial: 79.0,
  profissional: 147.0,
};

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingProvider,
    private readonly accountants: AccountantRepository,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  @Post('checkout')
  async checkout(@CurrentScope() scope: FirmScope) {
    const firm = await this.accountants.firm(scope);
    if (!firm) throw new Error('Contabilidade não encontrada');

    // 1. Obtém ou cria o cliente no Asaas
    const { customerId } = await this.billing.getOrCreateCustomer({
      name: firm.name,
      email: firm.contactEmail || 'faturamento@competa.com.br',
    });

    // 2. Define o plano e cria a assinatura (vamos usar "essencial" como default no MVP)
    const planName = 'essencial';
    const { subscriptionId, checkoutUrl } = await this.billing.createSubscription({
      customerId,
      planName,
      value: PLAN_RATES[planName],
    });

    // 3. Salva no banco os IDs do gateway
    await this.subscriptions.updateGatewayData(firm.id, customerId, subscriptionId);

    return { checkoutUrl };
  }
}

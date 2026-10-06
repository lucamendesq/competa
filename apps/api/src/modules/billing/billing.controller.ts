import { Body } from '@nestjs/common';
import * as z from 'zod';
import { zodPipe } from '../../lib/zod-pipe.js';

import { Controller, Post } from '@nestjs/common';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import { Session } from '../auth/session.decorator.js';
import type { AuthSession } from '../auth/auth-provider.js';
import { OnlyOwnerCanManageTeam } from '../auth/errors.js';
import type { FirmScope } from '../auth/scope.js';
import { BillingProvider } from './providers/billing.provider.js';
import { AccountantRepository } from '../auth/accountant.repository.js';
import { SubscriptionRepository } from './subscription.repository.js';

const PLAN_RATES = {
  essencial: 79.0,
  profissional: 147.0,
};

const CheckoutBody = z.object({
  planName: z.enum(['essencial', 'profissional']),
});

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingProvider,
    private readonly accountants: AccountantRepository,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  @Post('checkout')
  async checkout(
    @CurrentScope() scope: FirmScope,
    @Session() session: AuthSession,
    @Body(zodPipe(CheckoutBody)) body: z.infer<typeof CheckoutBody>,
  ) {
    if (!(await this.accountants.isOwner(scope, session.user.id))) {
      throw new OnlyOwnerCanManageTeam();
    }

    const firm = await this.accountants.firm(scope);
    if (!firm) throw new Error('Contabilidade não encontrada');

    // 1. Obtém ou cria o cliente no Asaas
    const { customerId } = await this.billing.getOrCreateCustomer({
      name: firm.name,
      email: firm.contactEmail || 'faturamento@competa.com.br',
    });

    // 2. Define o plano e cria a assinatura
    const planName = body.planName;
    const { subscriptionId, checkoutUrl } = await this.billing.createSubscription({
      customerId,
      planName,
      value: PLAN_RATES[planName],
    });

    // 3. Salva no banco os IDs do gateway
    await this.subscriptions.updateGatewayData(firm.id, customerId, subscriptionId);

    return { checkoutUrl, simulated: this.billing.simulated };
  }
}

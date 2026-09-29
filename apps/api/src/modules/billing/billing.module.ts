import { Logger, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import env from '../../config/env.js';
import { BillingController } from './billing.controller.js';
import { AsaasWebhookController } from './asaas-webhook.controller.js';
import { SubscriptionRepository } from './subscription.repository.js';
import { BillingProvider } from './providers/billing.provider.js';
import { AsaasBilling } from './providers/asaas-billing.provider.js';
import { LogBilling } from './providers/log-billing.provider.js';

const useAsaas = env.NODE_ENV === 'production';
new Logger('BillingModule').log(useAsaas ? 'AsaasBilling' : 'LogBilling (console)');

@Module({
  imports: [AuthModule],
  controllers: [BillingController, AsaasWebhookController],
  providers: [
    SubscriptionRepository,
    { provide: BillingProvider, useClass: useAsaas ? AsaasBilling : LogBilling }
  ],
  exports: [SubscriptionRepository]
})
export class BillingModule {}

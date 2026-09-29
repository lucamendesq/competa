import { Body, Controller, Post, Logger } from '@nestjs/common';
import { PUBLIC } from '../auth/public-route.decorator.js';
import { SubscriptionRepository } from './subscription.repository.js';

interface AsaasWebhookPayload {
  event?: string;
  payment?: {
    subscription?: string;
  };
}

@Controller('billing/webhook')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(private readonly subscriptions: SubscriptionRepository) {}

  @PUBLIC()
  @Post('asaas')
  async handleWebhook(@Body() payload: AsaasWebhookPayload) {
    // Validação básica do token do webhook (configurável no painel do Asaas)
    // if (token !== env.ASAAS_WEBHOOK_TOKEN) throw new UnauthorizedException();
    
    this.logger.log(`Webhook Asaas recebido: ${payload.event} para assinatura ${payload.payment?.subscription}`);

    if (!payload.payment?.subscription) {
      return { received: true };
    }

    const subscriptionId = payload.payment.subscription;

    if (payload.event === 'PAYMENT_RECEIVED') {
      await this.subscriptions.updateStatus(subscriptionId, 'ACTIVE');
    } else if (payload.event === 'PAYMENT_OVERDUE' || payload.event === 'PAYMENT_DELETED') {
      await this.subscriptions.updateStatus(subscriptionId, 'OVERDUE');
    }
    
    return { received: true };
  }
}

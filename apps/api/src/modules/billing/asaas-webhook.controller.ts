import { Body, Controller, Post, Logger, Headers } from '@nestjs/common';
import { PUBLIC } from '../auth/public-route.decorator.js';
import { Forbidden, ServiceUnavailable } from '../../lib/app-error.js';
import { secretEquals } from '../../lib/token.js';
import env from '../../config/env.js';
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
  async handleWebhook(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() payload: AsaasWebhookPayload,
  ) {
    /* Falha fechada: sem segredo configurado a rota não processa nada. O estado da
     * assinatura controla o TenantGuard, então um POST anônimo daria uso grátis ou
     * bloqueio de escrita de um tenant escolhido. */
    if (!env.ASAAS_WEBHOOK_TOKEN) {
      this.logger.error('ASAAS_WEBHOOK_TOKEN ausente: webhook recusado.');
      throw new ServiceUnavailable('Webhook não configurado.');
    }

    if (!secretEquals(token, env.ASAAS_WEBHOOK_TOKEN)) {
      this.logger.warn('Webhook Asaas com token inválido.');
      throw new Forbidden('Webhook não autorizado.');
    }

    this.logger.log(
      `Webhook Asaas recebido: ${payload.event} para assinatura ${payload.payment?.subscription}`,
    );

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

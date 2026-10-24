import { Logger } from '../../lib/logger.js';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import * as z from 'zod';
import env from '../../config/env.js';
import { fromRuntime } from '../../effect/runtime.js';
import { handler } from '../../http/envelope.js';
import { body, route } from '../../http/platform.js';
import { Forbidden, ServiceUnavailable } from '../../lib/app-error.js';
import { secretEquals } from '../../lib/token.js';
import { SubscriptionsRepo } from './subscription.repo.js';

interface AsaasWebhookPayload {
  event?: string;
  payment?: {
    subscription?: string;
  };
}

const logger = new Logger('AsaasWebhookController');

const webhook = route(
  'POST',
  '/billing/webhook/asaas',
  handler(
    'POST',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      /* `z.custom()` sem validador não valida nada — o `@Body()` do controller também não.
       * O parse vem ANTES dos checks porque no Express ele era middleware global. */
      const payload = yield* body(z.custom<AsaasWebhookPayload>());
      const token = request.headers['asaas-access-token'];

      /* Falha fechada: sem segredo configurado a rota não processa nada. O estado da
       * assinatura controla o TenantGuard, então um POST anônimo daria uso grátis ou
       * bloqueio de escrita de um tenant escolhido. */
      if (!env.ASAAS_WEBHOOK_TOKEN) {
        logger.error('ASAAS_WEBHOOK_TOKEN ausente: webhook recusado.');
        return yield* Effect.fail(new ServiceUnavailable('Webhook não configurado.'));
      }

      if (!secretEquals(token, env.ASAAS_WEBHOOK_TOKEN)) {
        logger.warn('Webhook Asaas com token inválido.');
        return yield* Effect.fail(new Forbidden('Webhook não autorizado.'));
      }

      logger.log(
        `Webhook Asaas recebido: ${payload.event} para assinatura ${payload.payment?.subscription}`,
      );

      if (!payload.payment?.subscription) {
        return { received: true };
      }

      const subscriptionId = payload.payment.subscription;

      if (payload.event === 'PAYMENT_RECEIVED') {
        yield* fromRuntime(
          SubscriptionsRepo.use((repo) => repo.updateStatus(subscriptionId, 'ACTIVE')),
        );
      } else if (payload.event === 'PAYMENT_OVERDUE' || payload.event === 'PAYMENT_DELETED') {
        yield* fromRuntime(
          SubscriptionsRepo.use((repo) => repo.updateStatus(subscriptionId, 'OVERDUE')),
        );
      }

      return { received: true };
    }),
  ),
);

export const asaasWebhookRoutes = Layer.mergeAll(webhook);

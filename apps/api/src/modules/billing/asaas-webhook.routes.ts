import { Logger } from '../../lib/logger.js';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import * as z from 'zod';
import env from '../../config/env.js';
import { handler } from '../../http/envelope.js';
import { body, publicRoute, route } from '../../http/platform.js';
import { throttleDefault } from '../../http/throttle.js';
import { Forbidden, ServiceUnavailable } from '../../lib/app-error.js';
import { secretEquals } from '../../lib/token.js';
import { statusForPaymentEvent } from './billing-rules.js';
import { SubscriptionsRepo } from './subscription.repo.js';

/* `passthrough` de propósito: a doc do Asaas avisa que novos atributos entram no payload
 * sem aviso e que estourar neles trava a fila de sincronização deles. Validamos só o que
 * lemos. */
const AsaasWebhookPayload = z
  .object({
    id: z.string().min(1).optional(),
    event: z.string().optional(),
    payment: z
      .object({ subscription: z.string().min(1).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const logger = new Logger('AsaasWebhookController');

const webhook = route(
  'POST',
  '/billing/webhook/asaas',
  handler(
    'POST',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const payload = yield* body(AsaasWebhookPayload);
      const token = request.headers['asaas-access-token'];

      /* Falha fechada: sem segredo configurado a rota não processa nada. O estado da
       * assinatura controla o `firmRoute`, então um POST anônimo daria uso grátis ou
       * bloqueio de escrita de um tenant escolhido. */
      if (!env.ASAAS_WEBHOOK_TOKEN) {
        logger.error('ASAAS_WEBHOOK_TOKEN ausente: webhook recusado.');
        return yield* Effect.fail(new ServiceUnavailable('Webhook não configurado.'));
      }

      if (!secretEquals(token, env.ASAAS_WEBHOOK_TOKEN)) {
        logger.warn('Webhook Asaas com token inválido.');
        return yield* Effect.fail(new Forbidden('Webhook não autorizado.'));
      }

      const { id, event } = payload;
      const subscriptionId = payload.payment?.subscription;

      logger.log(`Webhook Asaas recebido: ${event} para assinatura ${subscriptionId}`);

      if (!subscriptionId || !event) return { received: true };

      /* Idempotência antes do efeito: o Asaas reenvia em qualquer resposta não-2xx e pode
       * repetir uma entrega que deu certo. Sem isto, um `PAYMENT_RECEIVED` repetido
       * reabriria o período de cobrança a partir do novo `now()`. Evento sem `id` (payload
       * legado ou teste manual) segue em frente — melhor processar duas vezes que ignorar
       * um pagamento. */
      if (id) {
        const first = yield* SubscriptionsRepo.use((repo) => repo.claimEvent(id, event));
        if (!first) {
          logger.log(`Evento ${id} já processado; ignorando reenvio.`);
          return { received: true };
        }
      }

      const status = statusForPaymentEvent(event);
      if (status) {
        yield* SubscriptionsRepo.use((repo) => repo.updateStatus(subscriptionId, status));
      }

      return { received: true };
    }),
  ),
  /* O balde global (30/10s por IP) derrubava rajada do gateway, e um 429 que esgote a
   * retentativa do Asaas é um pagamento PERDIDO — firma paga e nunca ativa. O limite aqui
   * existe só contra enxurrada; quem autoriza é o token. */
  { auth: publicRoute, throttle: throttleDefault(600, 60_000) },
);

export const asaasWebhookRoutes = Layer.mergeAll(webhook);

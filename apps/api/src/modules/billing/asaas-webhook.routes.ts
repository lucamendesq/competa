import { Logger } from '../../lib/logger.js';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import * as z from 'zod';
import env from '../../config/env.js';
import { handler } from '../../http/envelope.js';
import { body, publicRoute, route } from '../../http/platform.js';
import type { Bucket } from '../../http/throttle.js';
import { Forbidden, ServiceUnavailable } from '../../lib/app-error.js';
import { secretEquals } from '../../lib/token.js';
import { asaasDate } from './billing-rules.js';
import { SubscriptionsRepo } from './subscription.repo.js';

/* `passthrough` de propósito: a doc do Asaas avisa que novos atributos entram no payload
 * sem aviso e que estourar neles trava a fila de sincronização deles. Validamos só o que
 * lemos. */
const AsaasWebhookPayload = z
  .object({
    id: z.string().min(1).optional(),
    event: z.string().optional(),
    payment: z
      .object({
        id: z.string().min(1).optional(),
        subscription: z.string().min(1).nullable().optional(),
        value: z.number().optional(),
        dueDate: z.string().nullable().optional(),
        paymentDate: z.string().nullable().optional(),
        externalReference: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    subscription: z
      .object({
        id: z.string().min(1).optional(),
        externalReference: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/* Só o balde sustentado: o `short` global (30/10s por IP) derrubava a rajada do dia 1, em
 * que o Asaas despacha os `PAYMENT_OVERDUE` do mês de uma vez. Um 429 conta como falha para
 * o gateway, e 15 falhas seguidas PAUSAM a fila dele — todo pagamento seguinte fica preso
 * até alguém religar no painel. O limite aqui existe só contra enxurrada; quem autoriza é
 * o token. */
const WEBHOOK_THROTTLE: readonly Bucket[] = [{ name: 'default', limit: 600, ttlMs: 60_000 }];

const logger = new Logger('AsaasWebhookController');

/* O Asaas só conta como entregue a resposta 200 (docs "Fila pausada": 201 e 204 também são
 * falha), e 15 falhas seguidas pausam a fila. Por isso todo desfecho tratado aqui — inclusive
 * evento inerte ou ignorado — responde 200; só token/configuração ruins saem com erro. */
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

      /* Todo evento do Asaas tem `id` (`evt_...`); é ele que barra o reenvio. Sem id não há
       * como processar uma vez só: registra e responde 200 inerte, porque qualquer outro
       * status entra no ciclo de reenvio deles. */
      const { id, event } = payload;
      if (!id) {
        logger.warn(`Webhook Asaas sem id (${event ?? 'sem event'}); ignorado.`);
        return { received: true };
      }
      if (!event) return { received: true };

      const gatewaySubscriptionId =
        payload.payment?.subscription ?? payload.subscription?.id ?? null;
      const externalReference =
        payload.payment?.externalReference ?? payload.subscription?.externalReference ?? null;

      logger.log(
        `Webhook Asaas recebido: ${event} (${id}) para assinatura ${gatewaySubscriptionId}`,
      );

      const result = yield* SubscriptionsRepo.use((repo) =>
        repo.applyEvent({
          eventId: id,
          event,
          gatewaySubscriptionId,
          externalReference,
          payment: {
            id: payload.payment?.id,
            value: payload.payment?.value,
            dueDate: asaasDate(payload.payment?.dueDate),
            paymentDate: asaasDate(payload.payment?.paymentDate),
          },
        }),
      );

      if (result.outcome === 'duplicate')
        logger.log(`Evento ${id} já processado; ignorando reenvio.`);
      if (result.outcome === 'ignored' && result.reason !== 'event') {
        logger.warn(`Evento ${id} (${event}) ignorado: ${result.reason}.`);
      }

      return { received: true };
    }),
    200,
  ),
  { auth: publicRoute, throttle: WEBHOOK_THROTTLE },
);

export const asaasWebhookRoutes = Layer.mergeAll(webhook);

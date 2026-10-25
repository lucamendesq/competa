import { createHmac, timingSafeEqual } from 'node:crypto';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import * as z from 'zod';
import env from '../../config/env.js';
import { handler } from '../../http/envelope.js';
import { body, route } from '../../http/platform.js';
import { Forbidden, ServiceUnavailable } from '../../lib/app-error.js';
import { secretEquals } from '../../lib/token.js';
import { WhatsappRepo } from './whatsapp.repo.js';

interface MetaStatusUpdate {
  id: string;
  status: 'delivered' | 'read' | 'failed';
  timestamp?: string;
  errors?: Array<{ message?: string }>;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: MetaStatusUpdate[];
      };
    }>;
  }>;
}

const isMetaSignatureValid = (
  rawBody: ArrayBuffer,
  signature: string | undefined,
  secret: string,
) => {
  if (!signature?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', secret).update(new Uint8Array(rawBody)).digest('hex');
  const given = Buffer.from(signature.slice('sha256='.length), 'hex');
  const wanted = Buffer.from(expected, 'hex');

  return given.length === wanted.length && timingSafeEqual(given, wanted);
};

const processStatusUpdate = (statusObj: MetaStatusUpdate) => {
  const timestampStr = statusObj.timestamp;
  const date = timestampStr ? new Date(parseInt(timestampStr, 10) * 1000) : new Date();

  return WhatsappRepo.use((repo) =>
    repo.updateMessageDeliveryStatus(statusObj.id, {
      status: statusObj.status,
      error: statusObj.errors?.[0]?.message || 'Unknown webhook error',
      date,
    }),
  );
};

const verifyChallenge = route(
  'GET',
  '/whatsapp/webhook',
  handler(
    'GET',
    Effect.gen(function* () {
      const query = yield* HttpServerRequest.ParsedSearchParams;
      const mode = query['hub.mode'];
      const token = query['hub.verify_token'];
      const challenge = query['hub.challenge'];

      if (!env.WHATSAPP_VERIFY_TOKEN) {
        return yield* Effect.fail(new ServiceUnavailable('Webhook não configurado.'));
      }
      if (mode !== 'subscribe' || !challenge) return { success: false };
      if (!secretEquals(typeof token === 'string' ? token : undefined, env.WHATSAPP_VERIFY_TOKEN)) {
        return yield* Effect.fail(new Forbidden('Token inválido.'));
      }

      return Number(challenge);
    }),
  ),
);

const receiveStatuses = route(
  'POST',
  '/whatsapp/webhook',
  handler(
    'POST',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      /* Bytes exatos do corpo, como o `rawBody: true` do Nest entregava: a assinatura da
       * Meta cobre o corpo cru, e reserializar o JSON mudaria o HMAC. `arrayBuffer` é
       * memoizado, então o `body()` abaixo relê os mesmos bytes. */
      const rawBody = yield* request.arrayBuffer;
      const payload = yield* body(z.custom<MetaWebhookPayload>());
      const signature = request.headers['x-hub-signature-256'];

      /* Sem a assinatura da Meta qualquer um falsifica status de entrega de mensagem de
       * qualquer tenant — o UPDATE casa só por `meta_message_id`. Falha fechada. */
      if (!env.META_APP_SECRET) {
        return yield* Effect.fail(new ServiceUnavailable('Webhook não configurado.'));
      }
      if (!isMetaSignatureValid(rawBody, signature, env.META_APP_SECRET)) {
        return yield* Effect.fail(new Forbidden('Assinatura inválida.'));
      }

      if (payload.object !== 'whatsapp_business_account') {
        return { success: true };
      }

      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          for (const status of change.value?.statuses ?? []) {
            yield* processStatusUpdate(status);
          }
        }
      }

      return { success: true };
    }),
  ),
);

export const whatsappWebhookRoutes = Layer.mergeAll(verifyChallenge, receiveStatuses);

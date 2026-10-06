import { Body, Controller, Get, Post, Query, Headers, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PUBLIC } from '../auth/public-route.decorator.js';
import { Forbidden, ServiceUnavailable } from '../../lib/app-error.js';
import { secretEquals } from '../../lib/token.js';
import env from '../../config/env.js';
import { WhatsappRepository } from './whatsapp.repository.js';

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

@Controller('whatsapp/webhook')
@PUBLIC()
export class WhatsappWebhookController {
  constructor(private readonly repository: WhatsappRepository) {}

  @Get()
  async verifyChallenge(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    if (!env.WHATSAPP_VERIFY_TOKEN) throw new ServiceUnavailable('Webhook não configurado.');
    if (mode !== 'subscribe' || !challenge) return { success: false };
    if (!secretEquals(token, env.WHATSAPP_VERIFY_TOKEN)) throw new Forbidden('Token inválido.');

    return Number(challenge);
  }

  @Post()
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: MetaWebhookPayload,
  ) {
    /* Sem a assinatura da Meta qualquer um falsifica status de entrega de mensagem de
     * qualquer tenant — o UPDATE casa só por `meta_message_id`. Falha fechada. */
    if (!env.META_APP_SECRET) throw new ServiceUnavailable('Webhook não configurado.');
    if (!isMetaSignatureValid(request.rawBody, signature, env.META_APP_SECRET)) {
      throw new Forbidden('Assinatura inválida.');
    }

    if (payload.object !== 'whatsapp_business_account') {
      return { success: true };
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.value?.statuses) {
          for (const status of change.value.statuses) {
            await this.processStatusUpdate(status);
          }
        }
      }
    }

    return { success: true };
  }

  private async processStatusUpdate(statusObj: MetaStatusUpdate) {
    const metaMessageId = statusObj.id;
    const status = statusObj.status;
    const timestampStr = statusObj.timestamp;
    const date = timestampStr ? new Date(parseInt(timestampStr, 10) * 1000) : new Date();

    await this.repository.updateMessageDeliveryStatus(metaMessageId, {
      status,
      error: statusObj.errors?.[0]?.message || 'Unknown webhook error',
      date,
    });
  }
}

const isMetaSignatureValid = (
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
) => {
  if (!rawBody || !signature?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = Buffer.from(signature.slice('sha256='.length), 'hex');
  const wanted = Buffer.from(expected, 'hex');

  return given.length === wanted.length && timingSafeEqual(given, wanted);
};

import { Body, Controller, Get, Post, Query, Headers } from '@nestjs/common';
import { PUBLIC } from '../auth/public-route.decorator.js';
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
    @Query('hub.verify_token') _token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    // In production, you would verify against a configured secret.
    // For now we just echo the challenge back if mode is subscribe
    if (mode === 'subscribe' && challenge) {
      return Number(challenge);
    }
    return { success: false };
  }

  @Post()
  async handleWebhook(
    @Headers('x-hub-signature-256') _signature: string,
    @Body() payload: MetaWebhookPayload,
  ) {
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

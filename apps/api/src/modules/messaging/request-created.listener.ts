import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as Sentry from '@sentry/nestjs';
import { EVENTS, type RequestCreatedEvent } from '../../lib/events.js';
import { linkDeliveryEmail } from './email-body.js';
import { MessageRepository } from './message.repository.js';

@Injectable()
export class RequestCreatedListener {
  private readonly logger = new Logger(RequestCreatedListener.name);

  constructor(private readonly messages: MessageRepository) {}

  @OnEvent(EVENTS.RequestCreated)
  async deliverUploadLink(event: RequestCreatedEvent) {
    try {
      await this.messages.deliver({
        requestId: event.requestId,
        purpose: 'link_delivery',
        recipient: event.contactEmail,
        ...linkDeliveryEmail(event),
      });
    } catch (error) {
      this.logger.error(`Falha ao entregar link da Solicitação ${event.requestId}`, error);
      Sentry.captureException(error);
    }
  }
}

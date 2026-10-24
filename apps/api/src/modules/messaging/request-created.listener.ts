import { Logger } from '../../lib/logger.js';
import * as Sentry from '@sentry/node';
import type { RequestCreatedEvent } from '../../lib/events.js';
import { linkDeliveryEmail } from './email-body.js';
import { MessageRepository } from './message.repository.js';

export class RequestCreatedListener {
  private readonly logger = new Logger(RequestCreatedListener.name);

  constructor(private readonly messages: MessageRepository) {}

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

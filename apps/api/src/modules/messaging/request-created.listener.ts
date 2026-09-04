import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, type RequestCreatedEvent } from '../../lib/events.js';
import { linkDeliveryEmail } from './email-body.js';
import { MessageRepository } from './message.repository.js';

@Injectable()
export class RequestCreatedListener {
  constructor(private readonly messages: MessageRepository) {}

  /** Abertura da Competência → Link de Upload para o Responsável. O `uploadUrl` só existe
   *  no payload: o banco guarda apenas o hash do token. */
  @OnEvent(EVENTS.RequestCreated)
  async deliverUploadLink(event: RequestCreatedEvent) {
    await this.messages.deliver({
      requestId: event.requestId,
      purpose: 'link_delivery',
      recipient: event.contactEmail,
      ...linkDeliveryEmail(event),
    });
  }
}

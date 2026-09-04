import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENTS,
  type DeadlineMissedEvent,
  type InviteCreatedEvent,
  type ItemReopenedEvent,
  type RequestCompletedEvent,
} from '../../lib/events.js';
import {
  deadlineMissedAccountantEmail,
  deadlineMissedContactEmail,
  inviteEmail,
  itemReopenedEmail,
  requestCompletedEmail,
} from './email-body.js';
import { MessageRepository } from './message.repository.js';

/** O que a revisão e o cron de prazo (collection) disparam. `deliver()` nunca lança:
 *  canal quebrado vira `status='failed'` + `error` e não volta para quem emitiu — falha de
 *  envio não pode desfazer uma rejeição já gravada. */
@Injectable()
export class CollectionEventsListener {
  constructor(private readonly messages: MessageRepository) {}

  /** Convite de Contador. Não vai para `message` (a tabela exige `request_id`), então
   *  falha aqui só aparece no log — o Contador ainda pode reenviar o convite. */
  @OnEvent(EVENTS.InviteCreated)
  async onInviteCreated(event: InviteCreatedEvent) {
    await this.messages.sendWithoutLog({
      recipient: event.email,
      ...inviteEmail(event),
    });
  }

  /** Reabertura do Item: reenvio do Link SÓ por email (invariante do domínio). */
  @OnEvent(EVENTS.ItemReopened)
  async onItemReopened(event: ItemReopenedEvent) {
    await this.messages.deliver({
      requestId: event.requestId,
      purpose: 'rejection',
      recipient: event.contactEmail,
      ...itemReopenedEmail(event),
    });
  }

  @OnEvent(EVENTS.RequestCompleted)
  async onRequestCompleted(event: RequestCompletedEvent) {
    await this.messages.deliver({
      requestId: event.requestId,
      purpose: 'completion',
      recipient: event.contactEmail,
      ...requestCompletedEmail(event),
    });
  }

  /** Prazo estourado avisa os DOIS lados: Responsável (com link) e Contador (sem link). */
  @OnEvent(EVENTS.DeadlineMissed)
  async onDeadlineMissed(event: DeadlineMissedEvent) {
    await this.messages.deliver({
      requestId: event.requestId,
      purpose: 'deadline_missed',
      recipient: event.contactEmail,
      ...deadlineMissedContactEmail(event),
    });

    for (const accountantEmail of event.accountantEmails) {
      await this.messages.deliver({
        requestId: event.requestId,
        purpose: 'deadline_missed',
        recipient: accountantEmail,
        ...deadlineMissedAccountantEmail(event),
      });
    }
  }
}

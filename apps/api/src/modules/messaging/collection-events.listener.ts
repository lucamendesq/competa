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
import { ContactRepository } from '../contacts/contact.repository.js';
import { MessageRepository } from './message.repository.js';
import { WebPush } from './providers/web-push.provider.js';

/** O que a revisão e o cron de prazo (collection) disparam. `deliver()` nunca lança:
 *  canal quebrado vira `status='failed'` + `error` e não volta para quem emitiu — falha de
 *  envio não pode desfazer uma rejeição já gravada. */
@Injectable()
export class CollectionEventsListener {
  constructor(
    private readonly messages: MessageRepository,
    private readonly contacts: ContactRepository,
    private readonly push: WebPush,
  ) {}

  /** Push é ADICIONAL ao email, nunca substituto: o Responsável pode não ter instalado a
   *  PWA (no iOS o Web Push exige "Adicionar à Tela de Início"). Falha aqui não propaga —
   *  a regra de canal que não bloqueia o fluxo vale igual. */
  private async notify(
    requestId: string,
    purpose: 'rejection' | 'completion' | 'deadline_missed',
    title: string,
    body: string,
    url?: string,
  ) {
    const subscriptions = await this.contacts.subscriptionsForRequest(requestId);
    if (subscriptions.length === 0) return;

    const result = await this.messages.deliverPush(requestId, purpose, subscriptions[0].endpoint, () =>
      this.push.send({
        title,
        body,
        url,
        subscriptions: subscriptions.map((row) => ({
          endpoint: row.endpoint,
          keys: row.keys as Record<string, string>,
        })),
      }),
    );

    // inscrição que o navegador descartou não serve mais: sai para não acumular lixo
    for (const endpoint of result?.gone ?? []) {
      await this.contacts.deletePushSubscriptionByEndpoint(endpoint);
    }
  }

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

    await this.notify(
      event.requestId,
      'rejection',
      `Reenvio necessário: ${event.itemName}`,
      `${event.companyName}: o documento foi recusado e precisa ser enviado de novo.`,
      event.uploadUrl,
    );
  }

  @OnEvent(EVENTS.RequestCompleted)
  async onRequestCompleted(event: RequestCompletedEvent) {
    await this.messages.deliver({
      requestId: event.requestId,
      purpose: 'completion',
      recipient: event.contactEmail,
      ...requestCompletedEmail(event),
    });

    await this.notify(
      event.requestId,
      'completion',
      'Documentos recebidos',
      `${event.companyName}: recebemos e conferimos tudo. Nada mais é necessário por agora.`,
    );
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

    await this.notify(
      event.requestId,
      'deadline_missed',
      `Prazo vencido: ${event.itemName}`,
      `${event.companyName}: o prazo era ${event.dueDate} e o documento ainda não chegou.`,
      event.uploadUrl,
    );

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

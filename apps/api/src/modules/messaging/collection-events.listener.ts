import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENTS,
  type AccessRecoveryRequestedEvent,
  type ContactInvitedEvent,
  type DeadlineMissedEvent,
  type InviteCreatedEvent,
  type ItemReopenedEvent,
  type RequestCompletedEvent,
  type RequestCreatedEvent,
  type ReviewPublishedEvent,
  type UploadLinkResentEvent,
} from '../../lib/events.js';
import {
  accessInviteEmail,
  asMonth,
  recoverConfirmEmail,
  deadlineMissedAccountantEmail,
  deadlineMissedContactEmail,
  inviteEmail,
  itemReopenedEmail,
  linkResentEmail,
  requestCompletedEmail,
  reviewPublishedEmail,
} from './email-body.js';
import { ContactRepository } from '../contacts/contact.repository.js';
import { MessageRepository } from './message.repository.js';
import { WebPush } from './providers/web-push.provider.js';

/** O que a revisão e o cron de prazo (collection) disparam. `deliver()` nunca lança:
 *  canal quebrado vira `status='failed'` + `error` e não volta para quem emitiu — falha de
 *  envio não pode desfazer uma rejeição já gravada. */
@Injectable()
export class CollectionEventsListener {
  private readonly logger = new Logger(CollectionEventsListener.name);

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
    purpose: 'link_delivery' | 'rejection' | 'completion' | 'deadline_missed',
    title: string,
    body: string,
    url?: string,
  ) {
    /* Try/catch em volta de TUDO: estes métodos rodam dentro de um listener de evento, e
     * `emit` não tem quem pegue a rejeição — uma consulta que falha aqui vira
     * unhandled rejection e derruba o processo inteiro por causa de uma notificação. */
    try {
      const subscriptions = await this.contacts.subscriptionsForRequest(requestId);
      if (subscriptions.length === 0) return;

      const result = await this.messages.deliverPush(
        requestId,
        purpose,
        subscriptions[0].endpoint,
        () =>
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
    } catch (error) {
      this.logger.error(`push ${purpose} da Solicitação ${requestId} falhou: ${String(error)}`);
    }
  }

  /** Devolve se o email saiu — o controller do "perdi meu link" responde cego, mas não
   *  registra passo 1 concluído sem entrega. Sem linha em `message`: não há requestId. */
  @OnEvent(EVENTS.AccessRecoveryRequested)
  async onAccessRecoveryRequested(event: AccessRecoveryRequestedEvent) {
    return this.messages.sendWithoutLog({
      recipient: event.email,
      ...recoverConfirmEmail({ name: event.contactName, confirmUrl: event.confirmUrl }),
    });
  }

  @OnEvent(EVENTS.InviteCreated)
  async onInviteCreated(event: InviteCreatedEvent) {
    await this.messages.sendWithoutLog({
      recipient: event.email,
      ...inviteEmail(event),
    });
  }

  @OnEvent(EVENTS.ContactInvited)
  async onContactInvited(event: ContactInvitedEvent) {
    await this.messages.sendWithoutLog({
      recipient: event.contactEmail,
      senderName: event.firmName,
      ...accessInviteEmail(event),
    });
  }

  /** Devolve se o email saiu: quem emitiu (`/access/recover`) só oficializa o token novo
   *  depois disso — link rotacionado com email falhado deixaria o Responsável sem nenhum. */
  @OnEvent(EVENTS.UploadLinkResent)
  async onUploadLinkResent(event: UploadLinkResentEvent) {
    return this.messages.deliver({
      requestId: event.requestId,
      purpose: 'resend',
      recipient: event.contactEmail,
      ...linkResentEmail(event),
    });
  }

  /** F10-5: push de "novo pedido". O email do Link sai pelo `RequestCreatedListener`; aqui
   *  é só o aviso. No primeiro mês o contato ainda não tem inscrição e `notify` retorna
   *  cedo — quem recebe é o fan-out recorrente, onde a inscrição sobrevive ao mês. */
  @OnEvent(EVENTS.RequestCreated)
  async onRequestCreated(event: RequestCreatedEvent) {
    await this.notify(
      event.requestId,
      'link_delivery',
      `Novos documentos solicitados`,
      `${event.companyName}: ${event.itemCount} documento(s) da competência ${asMonth(event.referenceMonth)}.`,
      event.uploadUrl,
    );
  }

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

  /** Uma entrega para a revisão inteira. `purpose: 'rejection'` é o mesmo do
   *  `ItemReopened`: para o Painel de Pendências e para o histórico de mensagens isto é
   *  uma recusa — só deixou de ser uma por documento. */
  @OnEvent(EVENTS.ReviewPublished)
  async onReviewPublished(event: ReviewPublishedEvent) {
    await this.messages.deliver({
      requestId: event.requestId,
      purpose: 'rejection',
      recipient: event.contactEmail,
      ...reviewPublishedEmail(event),
    });

    const first = event.rejected[0];

    await this.notify(
      event.requestId,
      'rejection',
      event.rejected.length === 1
        ? `Reenvio necessário: ${first.itemName ?? first.fileName}`
        : `${event.rejected.length} documentos precisam ser reenviados`,
      `${event.companyName}: a contabilidade conferiu e alguns arquivos precisam voltar.`,
      event.uploadUrl ?? undefined,
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

  /** Devolve se o email do RESPONSÁVEL saiu. O cron só marca `deadline_notified_at` com
   *  isso: marcar antes de confirmar a entrega significa que um provedor de email fora do
   *  ar faz o contato nunca ser avisado — e a marca impede a próxima varredura de tentar. */
  @OnEvent(EVENTS.DeadlineMissed)
  async onDeadlineMissed(event: DeadlineMissedEvent) {
    const delivered = await this.messages.deliver({
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

    return delivered;
  }
}

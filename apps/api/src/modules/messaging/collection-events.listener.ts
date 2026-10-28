import { Logger } from '../../lib/logger.js';
import { Effect } from 'effect';
import { squashError } from '../../infra/database/error.js';
import type {
  AccessRecoveryRequestedEvent,
  ContactInvitedEvent,
  DeadlineMissedEvent,
  InviteCreatedEvent,
  ItemReopenedEvent,
  ReminderDueEvent,
  RequestCompletedEvent,
  RequestCreatedEvent,
  ReviewPublishedEvent,
  UploadLinkResentEvent,
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
  reminderEmail,
  requestCompletedEmail,
  reviewPublishedEmail,
} from './email-body.js';
import { MessagesRepo } from './message.repo.js';
import { pushProvider } from './providers/providers.js';

const logger = new Logger('CollectionEventsListener');

/** Push é ADICIONAL ao email, nunca substituto: o Responsável pode não ter instalado a
 *  PWA (no iOS o Web Push exige "Adicionar à Tela de Início"). Falha aqui não propaga —
 *  a regra de canal que não bloqueia o fluxo vale igual. */
const notify = (
  requestId: string,
  purpose: 'link_delivery' | 'rejection' | 'completion' | 'deadline_missed' | 'reminder',
  title: string,
  body: string,
  url?: string,
) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    const subscriptions = yield* messages.subscriptionsForRequest(requestId);
    if (subscriptions.length === 0) return;

    const result = yield* messages.deliverPush(requestId, purpose, subscriptions[0].endpoint, () =>
      pushProvider.send({
        title,
        body,
        url,
        subscriptions: subscriptions.map((row) => ({
          endpoint: row.endpoint,
          keys: row.keys as Record<string, string>,
        })),
      }),
    );

    for (const endpoint of result?.gone ?? []) {
      yield* messages.deletePushSubscriptionByEndpoint(endpoint);
    }
  }).pipe(
    /* Captura TUDO: estes efeitos rodam dentro de um listener de evento, e `emit` não tem
     * quem pegue a rejeição — uma consulta que falha aqui derrubaria o processo inteiro
     * por causa de uma notificação. */
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logger.error(
          `push ${purpose} da Solicitação ${requestId} falhou: ${String(squashError(cause))}`,
        );
      }),
    ),
  );

/** Devolve se o email saiu — o controller do "perdi meu link" responde cego, mas não
 *  registra passo 1 concluído sem entrega. Sem linha em `message`: não há requestId. */
export const onAccessRecoveryRequested = (event: AccessRecoveryRequestedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.sendWithoutLog({
      recipient: event.email,
      ...recoverConfirmEmail({ name: event.contactName, confirmUrl: event.confirmUrl }),
    });
  });

export const onInviteCreated = (event: InviteCreatedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.sendWithoutLog({ recipient: event.email, ...inviteEmail(event) });
  });

export const onContactInvited = (event: ContactInvitedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.sendWithoutLog({
      recipient: event.contactEmail,
      senderName: event.firmName,
      ...accessInviteEmail(event),
    });
  });

/* Bug congelado #13: o resultado de `deliver` NÃO é devolvido, então o
 * `emitAsync(...).includes(true)` da rota de reenvio nunca casa — 503 com o email já
 * entregue e o token novo nunca aplicado. Não tocar. */
export const onUploadLinkResent = (event: UploadLinkResentEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.deliver({
      requestId: event.requestId,
      purpose: 'resend',
      recipient: event.contactEmail,
      ...linkResentEmail(event),
    });
  });

/** F10-5: push de "novo pedido". O email do Link sai pelo `RequestCreatedListener`; aqui
 *  é só o aviso. No primeiro mês o contato ainda não tem inscrição e `notify` retorna
 *  cedo — quem recebe é o fan-out recorrente, onde a inscrição sobrevive ao mês. */
export const onRequestCreated = (event: RequestCreatedEvent) =>
  notify(
    event.requestId,
    'link_delivery',
    `Novos documentos solicitados`,
    `${event.companyName}: ${event.itemCount} documento(s) da competência ${asMonth(event.referenceMonth)}.`,
    event.uploadUrl,
  );

export const onItemReopened = (event: ItemReopenedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.deliver({
      requestId: event.requestId,
      purpose: 'rejection',
      recipient: event.contactEmail,
      ...itemReopenedEmail(event),
    });

    yield* notify(
      event.requestId,
      'rejection',
      `Reenvio necessário: ${event.itemName}`,
      `${event.companyName}: o documento foi recusado e precisa ser enviado de novo.`,
      event.uploadUrl,
    );
  });

/** Uma entrega para a revisão inteira. `purpose: 'rejection'` é o mesmo do
 *  `ItemReopened`: para o Painel de Pendências e para o histórico de mensagens isto é
 *  uma recusa — só deixou de ser uma por documento. */
export const onReviewPublished = (event: ReviewPublishedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.deliver({
      requestId: event.requestId,
      purpose: 'rejection',
      recipient: event.contactEmail,
      ...reviewPublishedEmail(event),
    });

    const first = event.rejected[0];

    yield* notify(
      event.requestId,
      'rejection',
      event.rejected.length === 1
        ? `Reenvio necessário: ${first.itemName ?? 'Documento extra'}`
        : `${event.rejected.length} documentos precisam ser reenviados`,
      `${event.companyName}: a contabilidade conferiu e alguns arquivos precisam voltar.`,
      event.uploadUrl ?? undefined,
    );
  });

export const onRequestCompleted = (event: RequestCompletedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.deliver({
      requestId: event.requestId,
      purpose: 'completion',
      recipient: event.contactEmail,
      ...requestCompletedEmail(event),
    });

    yield* notify(
      event.requestId,
      'completion',
      'Documentos recebidos',
      `${event.companyName}: recebemos e conferimos tudo. Nada mais é necessário por agora.`,
    );
  });

/** Uma entrega por destinatário para todos os Itens vencidos da Solicitação. Devolve se o
 *  email do RESPONSÁVEL saiu. O cron só marca `deadline_notified_at` com isso: marcar
 *  antes de confirmar a entrega significa que um provedor de email fora do ar faz o
 *  contato nunca ser avisado — e a marca impede a próxima varredura de tentar. */
export const onDeadlineMissed = (event: DeadlineMissedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    const delivered = yield* messages.deliver({
      requestId: event.requestId,
      purpose: 'deadline_missed',
      recipient: event.contactEmail,
      ...deadlineMissedContactEmail(event),
    });

    yield* notify(
      event.requestId,
      'deadline_missed',
      event.overdueItems.length === 1
        ? `Prazo vencido: ${event.overdueItems[0].name}`
        : `${event.overdueItems.length} documentos com prazo vencido`,
      `${event.companyName}: ${event.overdueItems.length} documento(s) com prazo vencido ainda não chegaram.`,
      event.uploadUrl,
    );

    for (const accountantEmail of event.accountantEmails) {
      yield* messages.deliver({
        requestId: event.requestId,
        purpose: 'deadline_missed',
        recipient: accountantEmail,
        ...deadlineMissedAccountantEmail(event),
      });
    }

    return delivered;
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logger.error(
          `Falha no evento DeadlineMissed da Solicitação ${event.requestId}: ${String(squashError(cause))}`,
        );

        return false;
      }),
    ),
  );

export const onReminderDue = (event: ReminderDueEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.deliver({
      requestId: event.requestId,
      purpose: 'reminder',
      recipient: event.contactEmail,
      ...reminderEmail(event),
    });

    yield* notify(
      event.requestId,
      'reminder',
      `Lembrete: documentos pendentes`,
      `${event.companyName}: faltam documentos da competência ${asMonth(event.referenceMonth)}.`,
      event.uploadUrl,
    );
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logger.error(
          `Falha no evento ReminderDue da Solicitação ${event.requestId}: ${String(squashError(cause))}`,
        );
      }),
    ),
  );

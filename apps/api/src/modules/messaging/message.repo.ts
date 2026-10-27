import { Logger } from '../../lib/logger.js';
import { Context, Effect, Layer } from 'effect';
import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { planAllows, type MessageListQuery } from '@competa/contracts';
import env from '../../config/env.js';
import { Db, type Executor } from '../../infra/database/effect.js';
import {
  accountingFirm,
  company,
  contact,
  document,
  message,
  MESSAGE_PURPOSES,
  period,
  pushSubscription,
  request,
  requestItem,
  subscription,
  uploadLink,
} from '../../infra/database/schema/index.js';
import { reportChannelFailure } from '../../lib/observability.js';
import {
  contactIdsOf,
  type ContactScope,
  type FirmScope,
  type UploadScope,
} from '../auth/scope.js';
import { InvalidTransition } from '../requests/errors.js';
import {
  asMonth,
  deadlineMissedAccountantEmail,
  deadlineMissedContactEmail,
  linkResentEmail,
  reminderEmail,
  requestCompletedEmail,
  reviewPublishedEmail,
} from './email-body.js';
import type { MessageProvider } from './providers/message.provider.js';
import {
  emailProvider,
  integrationsFrom,
  makeWhatsappProvider,
  pushProvider,
} from './providers/providers.js';
import { WhatsappRepo } from '../whatsapp/whatsapp.repo.js';
import type { ReminderCandidate, ReminderSettings } from './reminder-rules.js';

const PENDING_ITEM_STATUS = ['pending', 'rejected'] as const;

export type MessagePurpose = (typeof MESSAGE_PURPOSES)[number];

export type Delivery = {
  requestId: string;
  purpose: MessagePurpose;
  recipient: string;
  subject: string;
  body: string;
  channel?: string;
  provider?: MessageProvider;
  fallbackRecipient?: string;
  fallbackProvider?: MessageProvider;
};

type ReminderRow = ReminderCandidate & {
  companyName: string;
  contactName: string;
  contactEmail: string;
  referenceMonth: string;
};

const logger = new Logger('MessageRepository');

/** Desfecho do reenvio. União tipada, e não `{sent:boolean}`, porque "não enviou" tem quatro
 *  causas distintas que o booleano achatava — inclusive o silêncio do bug congelado #15
 *  (purpose sem branch). O fio continua `{sent}`: a rota é quem achata, agora à vista. */
export type ResendOutcome =
  | { readonly _tag: 'Delivered' }
  | { readonly _tag: 'ProviderRefused' }
  | { readonly _tag: 'NoPushSubscription' }
  | { readonly _tag: 'PurposeNotResendable'; readonly purpose: string };

const outcomeOf = (ok: boolean): ResendOutcome =>
  ok ? { _tag: 'Delivered' } : { _tag: 'ProviderRefused' };

const make = Effect.gen(function* () {
  const db = yield* Db;
  const integrations = yield* WhatsappRepo;

  /* Montado na primeira mensagem de WhatsApp: em produção o crypto exige a chave, e quem
   * nunca manda WhatsApp não precisa dela para subir. */
  let whatsapp: MessageProvider | undefined;
  const whatsappProvider = () =>
    (whatsapp ??= makeWhatsappProvider(integrationsFrom(integrations)));

  const uploadLinkExpiry = Effect.fn('MessagesRepo.uploadLinkExpiry')(function* (
    requestId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({ expiresAt: uploadLink.expiresAt })
        .from(uploadLink)
        .where(eq(uploadLink.requestId, requestId))
        .limit(1),
    );

    return row?.expiresAt ?? null;
  });

  const savePushSubscription = Effect.fn('MessagesRepo.savePushSubscription')(function* (
    scope: ContactScope | UploadScope,
    input: { endpoint: string; keys: Record<string, string> },
  ) {
    const fromSession = 'memberships' in scope;
    const contactIds = fromSession ? contactIdsOf(scope) : [scope.contactId];

    /* Inscrição criada pelo Link de Upload (rota anônima) herda a validade do link: sem
     * isto ela sobrevivia à expiração e à rotação, e quem teve o link seguia recebendo
     * nome da Empresa e pendências para sempre. */
    const expiresAt = fromSession ? null : yield* uploadLinkExpiry(scope.requestId);

    const rows = yield* db.use((d) =>
      d
        .insert(pushSubscription)
        .values(
          contactIds.map((contactId) => ({ contactId, provider: 'web', expiresAt, ...input })),
        )
        .onConflictDoUpdate({
          target: [pushSubscription.contactId, pushSubscription.endpoint],
          set: { keys: input.keys, expiresAt },
        })
        .returning({ id: pushSubscription.id, endpoint: pushSubscription.endpoint }),
    );

    return rows[0];
  });

  const deletePushSubscription = Effect.fn('MessagesRepo.deletePushSubscription')(function* (
    scope: ContactScope,
    endpoint: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .delete(pushSubscription)
        .where(
          and(
            inArray(pushSubscription.contactId, contactIdsOf(scope)),
            eq(pushSubscription.endpoint, endpoint),
          ),
        )
        .returning({ id: pushSubscription.id }),
    );

    return row;
  });

  const deletePushSubscriptionByEndpoint = Effect.fn(
    'MessagesRepo.deletePushSubscriptionByEndpoint',
  )(function* (endpoint: string) {
    yield* db.use((d) => d.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint)));
  });

  const subscriptionsForRequest = Effect.fn('MessagesRepo.subscriptionsForRequest')(function* (
    requestId: string,
  ) {
    /* `selectDistinctOn(endpoint)`: o mesmo aparelho tem uma linha por contato (user
     * multi-empresa), e sem isto a mesma Empresa notificava o aparelho N vezes. */
    return yield* db.use((d) =>
      d
        .selectDistinctOn([pushSubscription.endpoint], {
          endpoint: pushSubscription.endpoint,
          keys: pushSubscription.keys,
          contactName: contact.name,
        })
        .from(pushSubscription)
        .innerJoin(contact, eq(contact.id, pushSubscription.contactId))
        .innerJoin(company, eq(company.id, contact.companyId))
        .innerJoin(request, eq(request.companyId, company.id))
        .where(
          and(
            eq(request.id, requestId),
            or(isNull(pushSubscription.expiresAt), gt(pushSubscription.expiresAt, new Date())),
          ),
        ),
    );
  });

  /** Sem `FirmScope`: quem chama é o listener do evento ou o cron — não há sessão, e o
   *  `request_id` já vem do fan-out/varredura, que nasceram dentro de um escopo.
   *  Nunca lança: falha de canal vira linha `failed` + log (regra 9/10). */
  const sendWithoutLog = Effect.fn('MessagesRepo.sendWithoutLog')(function* (input: {
    requestId?: string;
    purpose?: string;
    recipient: string;
    subject: string;
    body: string;
    senderName?: string;
  }) {
    return yield* Effect.promise(async () => {
      try {
        await emailProvider.send(input);
        return true;
      } catch (error) {
        logger.error(`envio para ${input.recipient} falhou`, error);
        reportChannelFailure('email', 'transient', error);
        return false;
      }
    });
  });

  /** O update é o último recurso de registro: se ele também falhar, resta o log — mas nunca
   *  uma exceção subindo de dentro do tratamento de erro. */
  const markFailedOn = async (
    executor: Executor,
    messageId: string | undefined,
    reason: string,
  ) => {
    if (!messageId) return;

    try {
      await executor
        .update(message)
        .set({ status: 'failed', error: reason })
        .where(eq(message.id, messageId));
    } catch (error) {
      logger.error(`não deu para registrar a falha da mensagem ${messageId}: ${String(error)}`);
    }
  };

  /** Nunca lança — nem quando é o BANCO que cai. O `insert` do log ficava fora do try, e
   *  como quem chama é um listener de evento, uma falha ali virava unhandled rejection e
   *  derrubava o processo. */
  const deliverPush = Effect.fn('MessagesRepo.deliverPush')(function* <
    T extends { sent: number; failed: number; gone: string[] },
  >(requestId: string, purpose: MessagePurpose, recipient: string, send: () => Promise<T>) {
    return yield* db.use(async (d): Promise<T | undefined> => {
      let messageId: string | undefined;

      try {
        const [row] = await d
          .insert(message)
          .values({ requestId, channel: 'push', purpose, recipient, status: 'queued' })
          .returning({ id: message.id });

        messageId = row.id;
        const result = await send();

        await d
          .update(message)
          .set(
            result.sent > 0
              ? { status: 'sent', sentAt: new Date() }
              : { status: 'failed', error: `nenhuma inscrição aceitou (${result.failed} falhas)` },
          )
          .where(eq(message.id, row.id));

        return result;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await markFailedOn(d, messageId, reason);
        logger.error(`push para ${recipient} falhou: ${reason}`);
        reportChannelFailure('push', purpose, error);

        return undefined;
      }
    });
  });

  /** Quem está cobrando. Resolvido aqui, uma vez por envio, em vez de viajar em todo
   *  payload de evento: o Responsável precisa reconhecer o remetente em QUALQUER email
   *  (link, lembrete, rejeição, prazo), e centralizar evita esquecer em um deles.
   *  ponytail: uma consulta por email — escritório pequeno; se doer, cachear por request. */
  /** Nome e logo do escritório para o cabeçalho do e-mail. O logo só sai no plano com a
   *  capability `branding` (D18 §3) — o `leftJoin` da assinatura cabe na mesma consulta que
   *  já buscava o nome, então o gate não custa round trip. */
  const brandOf = async (executor: Executor, requestId: string) => {
    const [row] = await executor
      .select({
        name: accountingFirm.name,
        logoUrl: accountingFirm.logoUrl,
        planName: subscription.planName,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(accountingFirm, eq(accountingFirm.id, period.accountingFirmId))
      .leftJoin(subscription, eq(subscription.accountingFirmId, accountingFirm.id))
      .where(eq(request.id, requestId))
      .limit(1);

    return {
      senderName: row?.name,
      brandLogoUrl: row && planAllows(row.planName ?? 'trial', 'branding') ? row.logoUrl : null,
    };
  };

  const contactEmailOf = async (
    executor: Executor,
    requestId: string,
  ): Promise<string | undefined> => {
    const [linkRow] = await executor
      .select({ email: contact.email })
      .from(uploadLink)
      .innerJoin(contact, eq(contact.id, uploadLink.contactId))
      .where(eq(uploadLink.requestId, requestId))
      .limit(1);

    if (linkRow?.email) return linkRow.email;

    const [companyContact] = await executor
      .select({ email: contact.email })
      .from(request)
      .innerJoin(contact, eq(contact.companyId, request.companyId))
      .where(eq(request.id, requestId))
      .limit(1);

    return companyContact?.email;
  };

  const attemptSendOn = async (
    executor: Executor,
    input: {
      requestId: string;
      purpose: MessagePurpose;
      recipient: string;
      subject: string;
      body: string;
      senderName?: string;
      brandLogoUrl?: string | null;
      provider: MessageProvider;
    },
  ): Promise<boolean> => {
    let messageId: string | undefined;

    try {
      const [row] = await executor
        .insert(message)
        .values({
          requestId: input.requestId,
          channel: input.provider.channel,
          purpose: input.purpose,
          recipient: input.recipient,
          status: 'queued',
        })
        .returning({ id: message.id });

      messageId = row.id;

      const result = await input.provider.send({
        requestId: input.requestId,
        purpose: input.purpose,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        senderName: input.senderName,
        brandLogoUrl: input.brandLogoUrl,
      });

      const metaMessageId = typeof result === 'string' ? result : undefined;

      await executor
        .update(message)
        .set({ status: 'sent', sentAt: new Date(), metaMessageId })
        .where(eq(message.id, row.id));

      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await markFailedOn(executor, messageId, reason);
      logger.error(
        `envio ${input.purpose} (${input.provider.channel}) para ${input.recipient} falhou: ${reason}`,
      );
      reportChannelFailure(input.provider.channel as 'email' | 'push', input.purpose, error);

      return false;
    }
  };

  const deliverOn = async (
    executor: Executor,
    {
      requestId,
      purpose,
      recipient,
      subject,
      body,
      channel,
      provider: explicitProvider,
      fallbackRecipient,
      fallbackProvider,
    }: Delivery,
  ) => {
    const primaryProvider =
      explicitProvider ?? (channel === 'whatsapp' ? whatsappProvider() : emailProvider);

    const { senderName, brandLogoUrl } = await brandOf(executor, requestId);

    const primaryDelivered = await attemptSendOn(executor, {
      requestId,
      purpose,
      recipient,
      subject,
      body,
      senderName,
      brandLogoUrl,
      provider: primaryProvider,
    });

    if (primaryDelivered) return true;

    const secondaryProvider =
      fallbackProvider ?? (primaryProvider.channel === 'whatsapp' ? emailProvider : undefined);

    if (secondaryProvider && secondaryProvider.channel !== primaryProvider.channel) {
      const secondaryRecipient =
        fallbackRecipient ??
        (secondaryProvider.channel === 'email'
          ? await contactEmailOf(executor, requestId)
          : undefined);

      if (secondaryRecipient) {
        logger.warn(
          `degradando envio ${purpose} da solicitação ${requestId}: ${primaryProvider.channel} falhou, tentando ${secondaryProvider.channel}`,
        );

        const fallbackDelivered = await attemptSendOn(executor, {
          requestId,
          purpose,
          recipient: secondaryRecipient,
          subject,
          body,
          senderName,
          brandLogoUrl,
          provider: secondaryProvider,
        });

        if (fallbackDelivered) return true;
      }
    }

    return false;
  };

  /** Devolve se a mensagem saiu, e NUNCA lança — nem por falha do banco. Quem chamou
   *  decide o que fazer: o lembrete não rotaciona o Link se o envio não saiu, o cron de
   *  prazo não marca o item como avisado, e a recuperação de acesso não oficializa o token
   *  novo. Canal quebrado nunca sobe como erro. */
  const deliver = Effect.fn('MessagesRepo.deliver')(function* (delivery: Delivery) {
    return yield* db.use((d) => deliverOn(d, delivery));
  });

  const list = Effect.fn('MessagesRepo.list')(function* (
    scope: FirmScope,
    query: MessageListQuery,
  ) {
    const where = and(
      eq(period.accountingFirmId, scope),
      ...(query.requestId ? [eq(message.requestId, query.requestId)] : []),
      ...(query.periodId ? [eq(request.periodId, query.periodId)] : []),
      ...(query.companyId ? [eq(request.companyId, query.companyId)] : []),
      ...(query.channel ? [eq(message.channel, query.channel)] : []),
      ...(query.purpose ? [eq(message.purpose, query.purpose)] : []),
      ...(query.status ? [eq(message.status, query.status)] : []),
    );

    return yield* db.use(async (d) => {
      const rows = await d
        .select({
          id: message.id,
          requestId: message.requestId,
          periodId: request.periodId,
          companyName: company.name,
          channel: message.channel,
          purpose: message.purpose,
          recipient: message.recipient,
          status: message.status,
          sentAt: message.sentAt,
          error: message.error,
          createdAt: message.createdAt,
        })
        .from(message)
        .innerJoin(request, eq(request.id, message.requestId))
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(where)
        // desempate por id: a varredura de prazo insere em rajada e `created_at` empata,
        // deixando a paginação indeterminada (linha repetida ou perdida entre páginas)
        .orderBy(desc(message.createdAt), desc(message.id))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage);

      const [total] = await d
        .select({ value: count() })
        .from(message)
        .innerJoin(request, eq(request.id, message.requestId))
        .innerJoin(period, eq(period.id, request.periodId))
        .where(where);

      return { rows, total: total.value };
    });
  });

  const resend = Effect.fn('MessagesRepo.resend')(function* (scope: FirmScope, messageId: string) {
    const [row] = yield* db.use((d) =>
      d
        .select({
          id: message.id,
          requestId: message.requestId,
          channel: message.channel,
          purpose: message.purpose,
          recipient: message.recipient,
          status: message.status,
          companyId: company.id,
          companyName: company.name,
          referenceMonth: period.referenceMonth,
          periodDueDate: period.dueDate,
          accountingFirmId: period.accountingFirmId,
          requestStatus: request.status,
        })
        .from(message)
        .innerJoin(request, eq(request.id, message.requestId))
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(and(eq(message.id, messageId), eq(period.accountingFirmId, scope)))
        .limit(1),
    );

    if (!row) return undefined;

    if (row.channel === 'push') {
      const subscriptions = yield* subscriptionsForRequest(row.requestId);
      if (subscriptions.length === 0) {
        return { _tag: 'NoPushSubscription' } as const;
      }

      let title = 'Aviso de documentos';
      let body = `${row.companyName}: atualização sobre seus documentos contábeis.`;
      let url: string | undefined;

      if (row.purpose === 'completion') {
        title = 'Documentos recebidos';
        body = `${row.companyName}: recebemos e conferimos tudo. Nada mais é necessário por agora.`;
      } else {
        if (row.requestStatus === 'closed') {
          return yield* Effect.fail(
            new InvalidTransition('Solicitação encerrada — não há mais link de envio.'),
          );
        }
        url = `${env.WEB_URL}/minha-area/pendencias`;

        if (row.purpose === 'link_delivery') {
          title = 'Novos documentos solicitados';
          body = `${row.companyName}: documentos da competência ${asMonth(row.referenceMonth)}.`;
        } else if (row.purpose === 'reminder') {
          title = 'Lembrete: documentos pendentes';
          body = `${row.companyName}: faltam documentos da competência ${asMonth(row.referenceMonth)}.`;
        } else if (row.purpose === 'rejection') {
          title = 'Reenvio necessário';
          body = `${row.companyName}: a contabilidade conferiu e alguns arquivos precisam voltar.`;
        } else if (row.purpose === 'deadline_missed') {
          title = 'Prazo vencido';
          body = `${row.companyName}: documentos da competência ${asMonth(row.referenceMonth)} pendentes.`;
        }
      }

      const result = yield* deliverPush(
        row.requestId,
        row.purpose as MessagePurpose,
        subscriptions[0].endpoint,
        () =>
          pushProvider.send({
            title,
            body,
            url,
            subscriptions: subscriptions.map((s) => ({
              endpoint: s.endpoint,
              keys: s.keys as Record<string, string>,
            })),
          }),
      );

      for (const endpoint of result?.gone ?? []) {
        yield* deletePushSubscriptionByEndpoint(endpoint);
      }

      return outcomeOf(Boolean(result && result.sent > 0));
    }

    if (row.purpose === 'completion') {
      const [contactRow] = yield* db.use((d) =>
        d
          .select({ name: contact.name })
          .from(uploadLink)
          .innerJoin(contact, eq(contact.id, uploadLink.contactId))
          .where(eq(uploadLink.requestId, row.requestId))
          .limit(1),
      );

      const delivered = yield* deliver({
        // o reenvio sai pelo MESMO canal do original; sem isto caía sempre no provider default
        channel: row.channel,
        requestId: row.requestId,
        purpose: 'completion',
        recipient: row.recipient,
        ...requestCompletedEmail({
          companyName: row.companyName,
          contactName: contactRow?.name ?? row.recipient,
          contactEmail: row.recipient,
          requestId: row.requestId,
        }),
      });

      return outcomeOf(delivered);
    }

    if (row.requestStatus === 'closed') {
      return yield* Effect.fail(
        new InvalidTransition('Solicitação encerrada — não há mais link de envio.'),
      );
    }

    const [contactRow] = yield* db.use((d) =>
      d
        .select({ name: contact.name, email: contact.email })
        .from(uploadLink)
        .innerJoin(contact, eq(contact.id, uploadLink.contactId))
        .where(eq(uploadLink.requestId, row.requestId))
        .limit(1),
    );

    const contactName = contactRow?.name ?? row.recipient;
    const contactEmail = contactRow?.email ?? row.recipient;
    const uploadUrl = `${env.WEB_URL}/minha-area/pendencias`;

    if (row.purpose === 'link_delivery') {
      const delivered = yield* deliver({
        // o reenvio sai pelo MESMO canal do original; sem isto caía sempre no provider default
        channel: row.channel,
        requestId: row.requestId,
        purpose: 'link_delivery',
        recipient: row.recipient,
        ...linkResentEmail({
          requestId: row.requestId,
          referenceMonth: row.referenceMonth,
          periodDueDate: row.periodDueDate,
          companyName: row.companyName,
          contactName,
          contactEmail: row.recipient,
          uploadUrl,
        }),
      });
      return outcomeOf(delivered);
    }

    if (row.purpose === 'reminder') {
      const pendingItems = yield* db.use((d) =>
        d
          .select({
            name: requestItem.name,
            dueDate: requestItem.dueDate,
          })
          .from(requestItem)
          .where(
            and(
              eq(requestItem.requestId, row.requestId),
              inArray(requestItem.status, PENDING_ITEM_STATUS),
            ),
          ),
      );

      const [stats] = yield* db.use((d) =>
        d
          .select({
            reminderCount: sql<number>`count(*) filter (
            where ${message.purpose} = 'reminder' and ${message.status} <> 'failed'
          )::int`,
            lastMessageAt: sql<Date | null>`max(${message.createdAt})`,
          })
          .from(message)
          .where(eq(message.requestId, row.requestId)),
      );

      const delivered = yield* deliver({
        // o reenvio sai pelo MESMO canal do original; sem isto caía sempre no provider default
        channel: row.channel,
        requestId: row.requestId,
        purpose: 'reminder',
        recipient: row.recipient,
        ...reminderEmail({
          requestId: row.requestId,
          accountingFirmId: row.accountingFirmId,
          companyName: row.companyName,
          referenceMonth: row.referenceMonth,
          periodDueDate: row.periodDueDate,
          contactName,
          reminderCount: stats?.reminderCount ?? 0,
          lastMessageAt: stats?.lastMessageAt ?? null,
          pendingItems,
          uploadUrl,
        }),
      });
      return outcomeOf(delivered);
    }

    if (row.purpose === 'rejection') {
      const rejectedDocs = yield* db.use((d) =>
        d
          .select({
            itemName: requestItem.name,
            rejectionReason: document.rejectionReason,
          })
          .from(document)
          .innerJoin(requestItem, eq(requestItem.id, document.requestItemId))
          .where(
            and(
              eq(document.requestId, row.requestId),
              eq(document.uploadStatus, 'uploaded'),
              eq(document.reviewStatus, 'rejected'),
            ),
          ),
      );

      const emailData = rejectedDocs.length
        ? reviewPublishedEmail({
            requestId: row.requestId,
            companyName: row.companyName,
            contactName,
            contactEmail: row.recipient,
            uploadUrl,
            rejected: rejectedDocs.map((doc) => ({
              itemName: doc.itemName,
              rejectionReason: doc.rejectionReason ?? '',
            })),
            acceptedItemNames: [],
          })
        : linkResentEmail({
            requestId: row.requestId,
            referenceMonth: row.referenceMonth,
            periodDueDate: row.periodDueDate,
            companyName: row.companyName,
            contactName,
            contactEmail: row.recipient,
            uploadUrl,
          });

      const delivered = yield* deliver({
        // o reenvio sai pelo MESMO canal do original; sem isto caía sempre no provider default
        channel: row.channel,
        requestId: row.requestId,
        purpose: 'rejection',
        recipient: row.recipient,
        ...emailData,
      });
      return outcomeOf(delivered);
    }

    if (row.purpose === 'deadline_missed') {
      const overdue = yield* db.use((d) =>
        d
          .select({ name: requestItem.name, dueDate: requestItem.dueDate })
          .from(requestItem)
          .where(
            and(
              eq(requestItem.requestId, row.requestId),
              inArray(requestItem.status, PENDING_ITEM_STATUS),
            ),
          ),
      );

      const overdueItems = overdue.map((item) => ({
        name: item.name,
        dueDate: item.dueDate ?? row.periodDueDate ?? '',
      }));

      const isContact = row.recipient === contactEmail;
      const emailData = isContact
        ? deadlineMissedContactEmail({
            requestId: row.requestId,
            companyName: row.companyName,
            contactName,
            contactEmail: row.recipient,
            overdueItems,
            uploadUrl,
            accountantEmails: [],
          })
        : deadlineMissedAccountantEmail({
            requestId: row.requestId,
            companyName: row.companyName,
            contactName,
            contactEmail,
            overdueItems,
            uploadUrl,
            accountantEmails: [row.recipient],
          });

      const delivered = yield* deliver({
        // o reenvio sai pelo MESMO canal do original; sem isto caía sempre no provider default
        channel: row.channel,
        requestId: row.requestId,
        purpose: 'deadline_missed',
        recipient: row.recipient,
        ...emailData,
      });
      return outcomeOf(delivered);
    }

    return { _tag: 'PurposeNotResendable', purpose: row.purpose } as const;
  });

  const failuresByPeriod = Effect.fn('MessagesRepo.failuresByPeriod')(function* (
    scope: FirmScope,
    periodId: string,
  ) {
    return yield* db.use((d) =>
      d
        .select({
          requestId: message.requestId,
          channel: message.channel,
          purpose: message.purpose,
          recipient: message.recipient,
          error: message.error,
          createdAt: message.createdAt,
        })
        .from(message)
        .innerJoin(request, eq(request.id, message.requestId))
        .innerJoin(period, eq(period.id, request.periodId))
        .where(
          and(
            eq(period.accountingFirmId, scope),
            eq(request.periodId, periodId),
            eq(message.status, 'failed'),
          ),
        )
        // desempate por id: a varredura de prazo insere em rajada e `created_at` empata,
        // deixando a paginação indeterminada (linha repetida ou perdida entre páginas)
        .orderBy(desc(message.createdAt), desc(message.id)),
    );
  });

  /** Cadência configurada de cada Contabilidade, para o `pickReminders`. */
  const reminderSettingsByFirm = Effect.fn('MessagesRepo.reminderSettingsByFirm')(function* (
    firmIds: string[],
  ) {
    if (!firmIds.length) return new Map<string, ReminderSettings>();

    const rows = yield* db.use((d) =>
      d
        .select({
          id: accountingFirm.id,
          reminderMax: accountingFirm.reminderMax,
          reminderDueSoonDays: accountingFirm.reminderDueSoonDays,
          reminderGapDays: accountingFirm.reminderGapDays,
        })
        .from(accountingFirm)
        .where(inArray(accountingFirm.id, firmIds)),
    );

    return new Map(rows.map(({ id, ...settings }) => [id, settings]));
  });

  /** Sem `scope` a varredura é global (cron). Com `scope` (rota manual) só a Contabilidade
   *  do chamador entra — sem isso qualquer contador dispararia cobrança e rotação de token
   *  nos outros tenants (AUTHZ-2). */
  const reminderCandidates = Effect.fn('MessagesRepo.reminderCandidates')(function* (
    scope?: FirmScope,
  ) {
    return yield* db.use(async (d): Promise<ReminderRow[]> => {
      const items = await d
        .select({
          requestId: request.id,
          accountingFirmId: period.accountingFirmId,
          companyName: company.name,
          referenceMonth: period.referenceMonth,
          periodDueDate: period.dueDate,
          itemName: requestItem.name,
          itemDueDate: requestItem.dueDate,
        })
        .from(requestItem)
        .innerJoin(request, eq(request.id, requestItem.requestId))
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(
          and(
            inArray(requestItem.status, PENDING_ITEM_STATUS),
            eq(request.status, 'open'),
            eq(period.status, 'open'),
            scope ? eq(period.accountingFirmId, scope) : undefined,
          ),
        );

      const requestIds = [...new Set(items.map((row) => row.requestId))];
      if (!requestIds.length) return [];

      const recipients = await d
        .selectDistinct({
          requestId: uploadLink.requestId,
          contactName: contact.name,
          contactEmail: contact.email,
        })
        .from(uploadLink)
        .innerJoin(contact, eq(contact.id, uploadLink.contactId))
        .where(inArray(uploadLink.requestId, requestIds));

      const stats = await d
        .select({
          requestId: message.requestId,
          // `status <> 'failed'`: o teto de 2 existe por custo de envio (domain.md, risco 2) —
          // lembrete que não saiu não pode consumir uma das duas cobranças do mês.
          reminderCount: sql<number>`count(*) filter (
          where ${message.purpose} = 'reminder' and ${message.status} <> 'failed'
        )::int`,
          lastMessageAt: sql<Date | null>`max(${message.createdAt})`,
        })
        .from(message)
        .where(inArray(message.requestId, requestIds))
        .groupBy(message.requestId);

      const recipientOf = new Map(recipients.map((row) => [row.requestId, row]));
      const statsOf = new Map(stats.map((row) => [row.requestId, row]));
      const candidates = new Map<string, ReminderRow>();

      for (const row of items) {
        const recipient = recipientOf.get(row.requestId);
        if (!recipient) continue;

        const candidate = candidates.get(row.requestId) ?? {
          requestId: row.requestId,
          accountingFirmId: row.accountingFirmId,
          companyName: row.companyName,
          referenceMonth: row.referenceMonth,
          periodDueDate: row.periodDueDate,
          contactName: recipient.contactName,
          contactEmail: recipient.contactEmail,
          reminderCount: statsOf.get(row.requestId)?.reminderCount ?? 0,
          lastMessageAt: statsOf.get(row.requestId)?.lastMessageAt ?? null,
          pendingItems: [],
        };

        candidate.pendingItems.push({ name: row.itemName, dueDate: row.itemDueDate });
        candidates.set(row.requestId, candidate);
      }

      return [...candidates.values()];
    });
  });

  return {
    savePushSubscription,
    deletePushSubscription,
    deletePushSubscriptionByEndpoint,
    subscriptionsForRequest,
    sendWithoutLog,
    deliverPush,
    deliver,
    list,
    resend,
    failuresByPeriod,
    reminderSettingsByFirm,
    reminderCandidates,
  };
});

export class MessagesRepo extends Context.Service<MessagesRepo, Effect.Success<typeof make>>()(
  'competa/api/messaging/MessagesRepo',
) {
  static readonly layerNoDeps = Layer.effect(MessagesRepo, make);
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(WhatsappRepo.layer),
    Layer.provide(Db.layer),
  );
}

import { Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { MessageListQuery } from '@contabilidade/contracts';
import env from '../../config/env.js';
import { InvalidTransition } from '../requests/errors.js';
import { reportChannelFailure } from '../../lib/observability.js';
import { Database } from '../../infra/database/database.js';
import {
  accountingFirm,
  company,
  contact,
  document,
  message,
  MESSAGE_PURPOSES,
  period,
  request,
  requestItem,
  uploadLink,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';
import { ContactRepository } from '../contacts/contact.repository.js';
import { RequestRepository } from '../requests/request.repository.js';
import {
  asMonth,
  deadlineMissedAccountantEmail,
  deadlineMissedContactEmail,
  linkResentEmail,
  reminderEmail,
  requestCompletedEmail,
  reviewPublishedEmail,
} from './email-body.js';
import { MessageProvider } from './providers/message.provider.js';
import { WebPush } from './providers/web-push.provider.js';
import type { ReminderCandidate, ReminderSettings } from './reminder-rules.js';

const PENDING_ITEM_STATUS = ['pending', 'rejected'] as const;

type MessagePurpose = (typeof MESSAGE_PURPOSES)[number];

type Delivery = {
  requestId: string;
  purpose: MessagePurpose;
  recipient: string;
  subject: string;
  body: string;
};

type ReminderRow = ReminderCandidate & {
  companyName: string;
  contactName: string;
  contactEmail: string;
  referenceMonth: string;
};

@Injectable()
export class MessageRepository {
  private readonly logger = new Logger(MessageRepository.name);

  constructor(
    private readonly db: Database,
    private readonly provider: MessageProvider,
    private readonly requests: RequestRepository,
    private readonly contacts: ContactRepository,
    private readonly push: WebPush,
  ) {}

  /** Sem `FirmScope`: quem chama é o listener do evento ou o cron — não há sessão, e o
   *  `request_id` já vem do fan-out/varredura, que nasceram dentro de um escopo.
   *  Nunca lança: falha de canal vira linha `failed` + log (regra 9/10). */
  async sendWithoutLog(input: {
    recipient: string;
    subject: string;
    body: string;
    senderName?: string;
  }) {
    try {
      await this.provider.send(input);
      return true;
    } catch (error) {
      this.logger.error(`envio para ${input.recipient} falhou`, error);
      reportChannelFailure('email', 'transient', error);
      return false;
    }
  }

  /** Nunca lança — nem quando é o BANCO que cai. O `insert` do log ficava fora do try, e
   *  como quem chama é um listener de evento, uma falha ali virava unhandled rejection e
   *  derrubava o processo. */
  async deliverPush<T extends { sent: number; failed: number; gone: string[] }>(
    requestId: string,
    purpose: MessagePurpose,
    recipient: string,
    send: () => Promise<T>,
  ) {
    let messageId: string | undefined;

    try {
      const [row] = await this.db
        .insert(message)
        .values({ requestId, channel: 'push', purpose, recipient, status: 'queued' })
        .returning({ id: message.id });

      messageId = row.id;
      const result = await send();

      await this.db
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
      await this.markFailed(messageId, reason);
      this.logger.error(`push para ${recipient} falhou: ${reason}`);
      reportChannelFailure('push', purpose, error);

      return undefined;
    }
  }

  /** O update é o último recurso de registro: se ele também falhar, resta o log — mas nunca
   *  uma exceção subindo de dentro do tratamento de erro. */
  private async markFailed(messageId: string | undefined, reason: string) {
    if (!messageId) return;

    try {
      await this.db
        .update(message)
        .set({ status: 'failed', error: reason })
        .where(eq(message.id, messageId));
    } catch (error) {
      this.logger.error(
        `não deu para registrar a falha da mensagem ${messageId}: ${String(error)}`,
      );
    }
  }

  /** Quem está cobrando. Resolvido aqui, uma vez por envio, em vez de viajar em todo
   *  payload de evento: o Responsável precisa reconhecer o remetente em QUALQUER email
   *  (link, lembrete, rejeição, prazo), e centralizar evita esquecer em um deles.
   *  ponytail: uma consulta por email — escritório pequeno; se doer, cachear por request. */
  private async firmNameOf(requestId: string) {
    const [row] = await this.db
      .select({ name: accountingFirm.name })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(accountingFirm, eq(accountingFirm.id, period.accountingFirmId))
      .where(eq(request.id, requestId))
      .limit(1);

    return row?.name;
  }

  /** Devolve se a mensagem saiu, e NUNCA lança — nem por falha do banco. Quem chamou
   *  decide o que fazer: o lembrete não rotaciona o Link se o envio não saiu, o cron de
   *  prazo não marca o item como avisado, e a recuperação de acesso não oficializa o token
   *  novo. Canal quebrado nunca sobe como erro. */
  async deliver({ requestId, purpose, recipient, subject, body }: Delivery) {
    let messageId: string | undefined;

    try {
      const [row] = await this.db
        .insert(message)
        .values({ requestId, channel: this.provider.channel, purpose, recipient, status: 'queued' })
        .returning({ id: message.id });

      messageId = row.id;

      const senderName = await this.firmNameOf(requestId);
      await this.provider.send({ recipient, subject, body, senderName });
      await this.db
        .update(message)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(message.id, row.id));

      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.markFailed(messageId, reason);
      this.logger.error(`envio ${purpose} para ${recipient} falhou: ${reason}`);
      reportChannelFailure(this.provider.channel as 'email' | 'push', purpose, error);

      return false;
    }
  }

  async list(scope: FirmScope, query: MessageListQuery) {
    const where = and(
      eq(period.accountingFirmId, scope),
      ...(query.requestId ? [eq(message.requestId, query.requestId)] : []),
      ...(query.periodId ? [eq(request.periodId, query.periodId)] : []),
      ...(query.companyId ? [eq(request.companyId, query.companyId)] : []),
      ...(query.channel ? [eq(message.channel, query.channel)] : []),
      ...(query.purpose ? [eq(message.purpose, query.purpose)] : []),
      ...(query.status ? [eq(message.status, query.status)] : []),
    );

    const rows = await this.db
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

    const [total] = await this.db
      .select({ value: count() })
      .from(message)
      .innerJoin(request, eq(request.id, message.requestId))
      .innerJoin(period, eq(period.id, request.periodId))
      .where(where);

    return { rows, total: total.value };
  }

  async resend(scope: FirmScope, messageId: string) {
    const [row] = await this.db
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
      .limit(1);

    if (!row) return undefined;

    if (row.channel === 'push') {
      const subscriptions = await this.contacts.subscriptionsForRequest(row.requestId);
      if (subscriptions.length === 0) {
        return { sent: false };
      }

      let title = 'Aviso de documentos';
      let body = `${row.companyName}: atualização sobre seus documentos contábeis.`;
      let url: string | undefined;

      if (row.purpose === 'completion') {
        title = 'Documentos recebidos';
        body = `${row.companyName}: recebemos e conferimos tudo. Nada mais é necessário por agora.`;
      } else {
        if (row.requestStatus === 'closed') {
          throw new InvalidTransition('Solicitação encerrada — não há mais link de envio.');
        }
        const rotated = await this.requests.rotateUploadLink(scope, row.requestId);
        url = rotated ? `${env.WEB_URL}/envio/${rotated.token}` : undefined;

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

      const result = await this.deliverPush(
        row.requestId,
        row.purpose as MessagePurpose,
        subscriptions[0].endpoint,
        () =>
          this.push.send({
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
        await this.contacts.deletePushSubscriptionByEndpoint(endpoint);
      }

      return { sent: Boolean(result && result.sent > 0) };
    }

    if (row.purpose === 'completion') {
      const [contactRow] = await this.db
        .select({ name: contact.name })
        .from(uploadLink)
        .innerJoin(contact, eq(contact.id, uploadLink.contactId))
        .where(eq(uploadLink.requestId, row.requestId))
        .limit(1);

      const delivered = await this.deliver({
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

      return { sent: delivered };
    }

    if (row.requestStatus === 'closed') {
      throw new InvalidTransition('Solicitação encerrada — não há mais link de envio.');
    }

    const rotated = await this.requests.rotateUploadLink(scope, row.requestId);
    if (!rotated) return { sent: false };

    const uploadUrl = `${env.WEB_URL}/envio/${rotated.token}`;

    if (row.purpose === 'link_delivery') {
      const delivered = await this.deliver({
        requestId: row.requestId,
        purpose: 'link_delivery',
        recipient: row.recipient,
        ...linkResentEmail({
          requestId: row.requestId,
          referenceMonth: row.referenceMonth,
          periodDueDate: row.periodDueDate,
          companyName: row.companyName,
          contactName: rotated.contactName,
          contactEmail: row.recipient,
          uploadUrl,
        }),
      });
      return { sent: delivered };
    }

    if (row.purpose === 'reminder') {
      const pendingItems = await this.db
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
        );

      const [stats] = await this.db
        .select({
          reminderCount: sql<number>`count(*) filter (
            where ${message.purpose} = 'reminder' and ${message.status} <> 'failed'
          )::int`,
          lastMessageAt: sql<Date | null>`max(${message.createdAt})`,
        })
        .from(message)
        .where(eq(message.requestId, row.requestId));

      const delivered = await this.deliver({
        requestId: row.requestId,
        purpose: 'reminder',
        recipient: row.recipient,
        ...reminderEmail({
          requestId: row.requestId,
          accountingFirmId: row.accountingFirmId,
          companyName: row.companyName,
          referenceMonth: row.referenceMonth,
          periodDueDate: row.periodDueDate,
          contactName: rotated.contactName,
          reminderCount: stats?.reminderCount ?? 0,
          lastMessageAt: stats?.lastMessageAt ?? null,
          pendingItems,
          uploadUrl,
        }),
      });
      return { sent: delivered };
    }

    if (row.purpose === 'rejection') {
      const rejectedDocs = await this.db
        .select({
          fileName: document.fileName,
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
        );

      const emailData = rejectedDocs.length
        ? reviewPublishedEmail({
            requestId: row.requestId,
            companyName: row.companyName,
            contactName: rotated.contactName,
            contactEmail: row.recipient,
            uploadUrl,
            rejected: rejectedDocs.map((doc) => ({
              fileName: doc.fileName,
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
            contactName: rotated.contactName,
            contactEmail: row.recipient,
            uploadUrl,
          });

      const delivered = await this.deliver({
        requestId: row.requestId,
        purpose: 'rejection',
        recipient: row.recipient,
        ...emailData,
      });
      return { sent: delivered };
    }

    if (row.purpose === 'deadline_missed') {
      const [overdueItem] = await this.db
        .select({ id: requestItem.id, name: requestItem.name, dueDate: requestItem.dueDate })
        .from(requestItem)
        .where(
          and(
            eq(requestItem.requestId, row.requestId),
            inArray(requestItem.status, PENDING_ITEM_STATUS),
          ),
        )
        .limit(1);

      const requestItemId = overdueItem?.id ?? '';
      const itemName = overdueItem?.name ?? 'documentos';
      const dueDate = overdueItem?.dueDate ?? row.periodDueDate ?? '';

      const isContact = row.recipient === rotated.contactEmail;
      const emailData = isContact
        ? deadlineMissedContactEmail({
            requestId: row.requestId,
            requestItemId,
            companyName: row.companyName,
            contactName: rotated.contactName,
            contactEmail: row.recipient,
            itemName,
            dueDate,
            uploadUrl,
            accountantEmails: [],
          })
        : deadlineMissedAccountantEmail({
            requestId: row.requestId,
            requestItemId,
            companyName: row.companyName,
            contactName: rotated.contactName,
            contactEmail: rotated.contactEmail,
            itemName,
            dueDate,
            uploadUrl,
            accountantEmails: [row.recipient],
          });

      const delivered = await this.deliver({
        requestId: row.requestId,
        purpose: 'deadline_missed',
        recipient: row.recipient,
        ...emailData,
      });
      return { sent: delivered };
    }

    return { sent: false };
  }

  async failuresByPeriod(scope: FirmScope, periodId: string) {
    return (
      this.db
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
        .orderBy(desc(message.createdAt), desc(message.id))
    );
  }

  /** Cadência configurada de cada Contabilidade, para o `pickReminders`. */
  async reminderSettingsByFirm(firmIds: string[]) {
    if (!firmIds.length) return new Map<string, ReminderSettings>();

    const rows = await this.db
      .select({
        id: accountingFirm.id,
        reminderMax: accountingFirm.reminderMax,
        reminderDueSoonDays: accountingFirm.reminderDueSoonDays,
        reminderGapDays: accountingFirm.reminderGapDays,
      })
      .from(accountingFirm)
      .where(inArray(accountingFirm.id, firmIds));

    return new Map(rows.map(({ id, ...settings }) => [id, settings]));
  }

  /** Sem `scope` a varredura é global (cron). Com `scope` (rota manual) só a Contabilidade
   *  do chamador entra — sem isso qualquer contador dispararia cobrança e rotação de token
   *  nos outros tenants (AUTHZ-2). */
  async reminderCandidates(scope?: FirmScope): Promise<ReminderRow[]> {
    const items = await this.db
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

    const recipients = await this.db
      .selectDistinct({
        requestId: uploadLink.requestId,
        contactName: contact.name,
        contactEmail: contact.email,
      })
      .from(uploadLink)
      .innerJoin(contact, eq(contact.id, uploadLink.contactId))
      .where(inArray(uploadLink.requestId, requestIds));

    const stats = await this.db
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
  }
}

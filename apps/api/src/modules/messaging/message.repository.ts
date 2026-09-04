import { Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { MessageListQuery } from '@contabilidade/contracts';
import { Database } from '../../infra/database/database.js';
import {
  company,
  contact,
  message,
  period,
  request,
  requestItem,
  uploadLink,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';
import { MessageProvider } from './providers/message.provider.js';
import type { ReminderCandidate } from './reminder-rules.js';

const PENDING_ITEM_STATUS = ['pending', 'rejected'] as const;

/** Vocabulário de `message.purpose` (o check do banco é a mesma lista). */
type MessagePurpose = 'link_delivery' | 'reminder' | 'rejection' | 'deadline_missed' | 'completion';

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
  ) {}

  /** Sem `FirmScope`: quem chama é o listener do evento ou o cron — não há sessão, e o
   *  `request_id` já vem do fan-out/varredura, que nasceram dentro de um escopo.
   *  Nunca lança: falha de canal vira linha `failed` + log (regra 9/10). */
  /** Envio que não tem Solicitação para amarrar (convite). Sem linha em `message`, mas
   *  com a mesma garantia: falha de canal é logada e não propaga. */
  async sendWithoutLog(input: { recipient: string; subject: string; body: string }) {
    try {
      await this.provider.send(input);
      return true;
    } catch (error) {
      this.logger.error(`envio para ${input.recipient} falhou`, error);
      return false;
    }
  }

  /** Registra o envio de push em `message` (channel 'push') com o mesmo contrato do email:
   *  `sent`/`failed` + `error`, e nunca lança. `recipient` é o endpoint da inscrição. */
  async deliverPush<T extends { sent: number; failed: number; gone: string[] }>(
    requestId: string,
    purpose: MessagePurpose,
    recipient: string,
    send: () => Promise<T>,
  ) {
    const [row] = await this.db
      .insert(message)
      .values({ requestId, channel: 'push', purpose, recipient, status: 'queued' })
      .returning({ id: message.id });

    try {
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
      await this.db
        .update(message)
        .set({ status: 'failed', error: reason })
        .where(eq(message.id, row.id));
      this.logger.error(`push para ${recipient} falhou: ${reason}`);

      return undefined;
    }
  }

  async deliver({ requestId, purpose, recipient, subject, body }: Delivery) {
    const [row] = await this.db
      .insert(message)
      .values({ requestId, channel: this.provider.channel, purpose, recipient, status: 'queued' })
      .returning({ id: message.id });

    try {
      await this.provider.send({ recipient, subject, body });
      await this.db
        .update(message)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(message.id, row.id));

      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.db
        .update(message)
        .set({ status: 'failed', error: reason })
        .where(eq(message.id, row.id));
      this.logger.error(`envio ${purpose} para ${recipient} falhou: ${reason}`);

      // devolve o resultado em vez de lançar: quem chamou decide (o lembrete, por exemplo,
      // não rotaciona o Link se o envio não saiu) — e canal quebrado nunca sobe como erro
      return false;
    }
  }

  /** Log de envios para o Contador. `message` só é alcançável pelo join até `period` da
   *  Contabilidade da sessão. */
  async list(scope: FirmScope, query: MessageListQuery) {
    const where = and(
      eq(period.accountingFirmId, scope),
      ...(query.requestId ? [eq(message.requestId, query.requestId)] : []),
      ...(query.periodId ? [eq(request.periodId, query.periodId)] : []),
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

  /** Contrato com a Fase 6 (TASK-030): falhas de envio de uma Competência. */
  async failuresByPeriod(scope: FirmScope, periodId: string) {
    return this.db
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
      .orderBy(desc(message.createdAt), desc(message.id));
  }

  /** Insumo da varredura de lembretes; a decisão é do `reminder-rules.ts` (puro).
   *  Sem `FirmScope`: o cron atende todas as Contabilidades — não há sessão.
   *  ponytail: varredura completa das Solicitações abertas a cada execução — carteira de
   *  escritório pequeno; paginar/filtrar por competência recente quando doer. */
  async reminderCandidates(): Promise<ReminderRow[]> {
    const items = await this.db
      .select({
        requestId: request.id,
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

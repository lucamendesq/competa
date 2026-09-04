import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { format } from 'date-fns';
import env from '../../config/env.js';
import { EVENTS, type DeadlineMissedEvent } from '../../lib/events.js';
import type { FirmScope } from '../auth/scope.js';
import { effectiveDueDate } from './review-rules.js';
import { RequestRepository } from './request.repository.js';

/** Varredura de prazo estourado: emite `DeadlineMissed` (avisa Responsável E Contador).
 *
 *  "Já avisei este item" é `request_item.deadline_notified_at` (e não estado em memória):
 *  reiniciar a API não pode reavisar o cliente. A reabertura do Item limpa a marca, então
 *  um prazo estourado de novo volta a avisar. */
@Injectable()
export class DeadlineCron {
  private readonly logger = new Logger(DeadlineCron.name);

  constructor(
    private readonly requests: RequestRepository,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async daily() {
    const { notified } = await this.scan(null);
    if (notified.length) this.logger.log(`Prazo estourado: ${notified.length} item(ns) avisado(s).`);
  }

  async scan(scope: FirmScope | null) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const overdue = await this.requests.overdueItems(scope, today);
    const pendingNotice = overdue.filter((row) => row.deadlineNotifiedAt === null);

    const emailsByFirm = await this.requests.accountantEmails([
      ...new Set(pendingNotice.map((row) => row.accountingFirmId)),
    ]);

    // Um token por Solicitação por varredura: rotacionar por item deixaria o email do item
    // anterior com um link já morto.
    const tokenByRequest = new Map<string, string>();
    const notified: { requestItemId: string; itemName: string; companyName: string; dueDate: string }[] =
      [];

    for (const row of pendingNotice) {
      const token =
        tokenByRequest.get(row.requestId) ?? (await this.requests.rotateUploadToken(row.requestId));
      if (!token) continue;
      tokenByRequest.set(row.requestId, token);

      const missed: DeadlineMissedEvent = {
        requestId: row.requestId,
        requestItemId: row.requestItemId,
        itemName: row.itemName,
        dueDate: effectiveDueDate(row)!,
        companyName: row.companyName,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        uploadUrl: `${env.WEB_URL}/envio/${token}`,
        accountantEmails: emailsByFirm.get(row.accountingFirmId) ?? [],
      };

      this.events.emit(EVENTS.DeadlineMissed, missed);
      notified.push({
        requestItemId: row.requestItemId,
        itemName: row.itemName,
        companyName: row.companyName,
        dueDate: missed.dueDate,
      });
    }

    await this.requests.markDeadlineNotified(notified.map((row) => row.requestItemId));

    return { overdue: overdue.length, alreadyNotified: overdue.length - pendingNotice.length, notified };
  }
}

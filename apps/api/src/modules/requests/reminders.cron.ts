import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SentryCron } from '@sentry/nestjs';
import * as Sentry from '@sentry/nestjs';
import env from '../../config/env.js';
import { EVENTS, type ReminderDueEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { pickReminders } from '../messaging/reminder-rules.js';
import { RequestRepository } from './request.repository.js';

const REMINDERS_CRON_LOCK_ID = 42001;

@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(
    private readonly requests: RequestRepository,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'America/Sao_Paulo' })
  @SentryCron('reminders-daily', {
    schedule: { type: 'crontab', value: '0 9 * * *' },
    checkinMargin: 5,
    maxRuntime: 30,
    timezone: 'America/Sao_Paulo',
  })
  async scheduled() {
    await this.requests.withAdvisoryLock(REMINDERS_CRON_LOCK_ID, async () => {
      await this.run();
    });
  }

  async run(scope?: FirmScope) {
    const candidates = await this.requests.reminderCandidates(scope);
    const settingsByFirm = await this.requests.reminderSettingsByFirm([
      ...new Set(candidates.map((row) => row.accountingFirmId)),
    ]);
    const due = pickReminders(candidates, new Date(), settingsByFirm);

    let sent = 0;

    for (const candidate of due) {
      try {
        const { token, tokenHash } = createToken();
        const uploadUrl = `${env.WEB_URL}/envio/${token}`;

        await this.requests.applyUploadToken(candidate.requestId, tokenHash);

        const event: ReminderDueEvent = {
          requestId: candidate.requestId,
          referenceMonth: candidate.referenceMonth,
          periodDueDate: candidate.periodDueDate,
          companyName: candidate.companyName,
          contactName: candidate.contactName,
          contactEmail: candidate.contactEmail,
          uploadUrl,
          pendingItems: candidate.pendingItems,
        };

        this.events.emit(EVENTS.ReminderDue, event);
        sent += 1;
      } catch (error) {
        this.logger.error(
          `Falha ao processar lembrete da Solicitação ${candidate.requestId}: ${String(error)}`,
          error,
        );
        Sentry.captureException(error);
      }
    }

    this.logger.log(`lembretes: ${sent} de ${candidates.length} Solicitações elegíveis`);

    return { scanned: candidates.length, sent };
  }
}

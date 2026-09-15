import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SentryCron } from '@sentry/nestjs';
import env from '../../config/env.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { RequestRepository } from '../requests/request.repository.js';
import { reminderEmail } from './email-body.js';
import { MessageRepository } from './message.repository.js';
import { pickReminders } from './reminder-rules.js';

@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(
    private readonly messages: MessageRepository,
    private readonly requests: RequestRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'America/Sao_Paulo' })
  @SentryCron('reminders-daily', {
    schedule: { type: 'crontab', value: '0 9 * * *' },
    checkinMargin: 5,
    maxRuntime: 30,
    timezone: 'America/Sao_Paulo',
  })
  async scheduled() {
    await this.run();
  }

  async run(scope?: FirmScope) {
    const candidates = await this.messages.reminderCandidates(scope);
    const settingsByFirm = await this.messages.reminderSettingsByFirm([
      ...new Set(candidates.map((row) => row.accountingFirmId)),
    ]);
    const due = pickReminders(candidates, new Date(), settingsByFirm);

    let sent = 0;

    for (const candidate of due) {
      /* Gera → envia → só então persiste. O lembrete leva link novo (o token em claro só
       * existe aqui), e se o canal falhar nada é trocado: o Responsável continua com o
       * link que já tinha. Rotacionar antes de enviar o deixava sem link nenhum. */
      const { token, tokenHash } = createToken();
      const uploadUrl = `${env.WEB_URL}/envio/${token}`;

      const delivered = await this.messages.deliver({
        requestId: candidate.requestId,
        purpose: 'reminder',
        recipient: candidate.contactEmail,
        ...reminderEmail({ ...candidate, uploadUrl }),
      });

      if (!delivered) continue;

      await this.requests.applyUploadToken(candidate.requestId, tokenHash);
      sent += 1;
    }

    this.logger.log(`lembretes: ${sent} de ${candidates.length} Solicitações elegíveis`);

    return { scanned: candidates.length, sent };
  }
}

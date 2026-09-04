import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import env from '../../config/env.js';
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

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async scheduled() {
    await this.run();
  }

  /** Público para a rota de operação disparar a mesma varredura do cron. */
  async run() {
    const candidates = await this.messages.reminderCandidates();
    const due = pickReminders(candidates, new Date());

    for (const candidate of due) {
      // Rotaciona o Link a cada lembrete: o token em claro só existe neste instante (o
      // banco guarda o hash), então é a única forma de o lembrete levar link clicável.
      // Efeito colateral aceito: o link do email anterior morre — o lembrete mais recente
      // é sempre o que funciona.
      const token = await this.requests.rotateUploadToken(candidate.requestId);
      const uploadUrl = token ? `${env.WEB_URL}/envio/${token}` : undefined;

      await this.messages.deliver({
        requestId: candidate.requestId,
        purpose: 'reminder',
        recipient: candidate.contactEmail,
        ...reminderEmail({ ...candidate, uploadUrl }),
      });
    }

    this.logger.log(`lembretes: ${due.length} de ${candidates.length} Solicitações elegíveis`);

    return { scanned: candidates.length, sent: due.length };
  }
}

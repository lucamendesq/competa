import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { reminderEmail } from './email-body.js';
import { MessageRepository } from './message.repository.js';
import { pickReminders } from './reminder-rules.js';

@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(private readonly messages: MessageRepository) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async scheduled() {
    await this.run();
  }

  /** Público para a rota de operação disparar a mesma varredura do cron. */
  async run() {
    const candidates = await this.messages.reminderCandidates();
    const due = pickReminders(candidates, new Date());

    for (const candidate of due) {
      await this.messages.deliver({
        requestId: candidate.requestId,
        purpose: 'reminder',
        recipient: candidate.contactEmail,
        ...reminderEmail(candidate),
      });
    }

    this.logger.log(`lembretes: ${due.length} de ${candidates.length} Solicitações elegíveis`);

    return { scanned: candidates.length, sent: due.length };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import env from '../../config/env.js';
import { createToken } from '../../lib/token.js';
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

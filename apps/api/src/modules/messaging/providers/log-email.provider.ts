import { Injectable, Logger } from '@nestjs/common';
import { MessageProvider, type MessageToSend } from './message.provider.js';

/** Fallback de dev (D12, mesmo padrão do LocalStorage): sem `RESEND_API_KEY` o email
 *  vai para o log — a fatia é demonstrável sem credencial. */
@Injectable()
export class LogEmail extends MessageProvider {
  private readonly logger = new Logger(LogEmail.name);

  async send({ recipient, subject, body }: MessageToSend) {
    this.logger.log(`email → ${recipient} | ${subject}\n${body}`);
  }
}

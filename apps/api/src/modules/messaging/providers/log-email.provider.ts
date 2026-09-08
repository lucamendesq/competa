import { Injectable, Logger } from '@nestjs/common';
import { MessageProvider, type MessageToSend } from './message.provider.js';

const PRODUCT_NAME = 'Coleta de Documentos';

@Injectable()
export class LogEmail extends MessageProvider {
  private readonly logger = new Logger(LogEmail.name);

  async send({ recipient, subject, body, senderName }: MessageToSend) {
    const from = senderName ? `${senderName} via ${PRODUCT_NAME}` : PRODUCT_NAME;

    this.logger.log(
      ['', `from:    ${from}`, `to:      ${recipient}`, `subject: ${subject}`, '', body, ''].join(
        '\n',
      ),
    );
  }
}

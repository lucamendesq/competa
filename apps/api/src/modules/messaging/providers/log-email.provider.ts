import { Injectable, Logger } from '@nestjs/common';
import { MessageProvider, type MessageToSend } from './message.provider.js';

const PRODUCT_NAME = 'Competa';

@Injectable()
export class LogEmail extends MessageProvider {
  private readonly logger = new Logger(LogEmail.name);

  async send({ recipient, subject, body, senderName }: MessageToSend) {
    const from = senderName ? `${senderName} via ${PRODUCT_NAME}` : PRODUCT_NAME;

    // Extrai URLs do corpo HTML
    const urls = [...body.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    
    // Remove tags HTML para um log mais limpo
    const plainBody = body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    const links = urls.length > 0 ? ['\nLinks:', ...urls.map(u => `  ${u}`)].join('\n') : '';

    this.logger.log(
      ['', `from:    ${from}`, `to:      ${recipient}`, `subject: ${subject}`, '', plainBody, links, ''].join(
        '\n',
      ),
    );
  }
}

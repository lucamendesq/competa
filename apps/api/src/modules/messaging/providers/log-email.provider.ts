import { Logger } from '../../../lib/logger.js';
import { MessageProvider, type MessageToSend } from './message.provider.js';

export class LogEmail extends MessageProvider {
  private readonly logger = new Logger(LogEmail.name);

  async send({ recipient, subject, body }: MessageToSend) {
    const links = [...new Set([...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))];

    this.logger.log(`${recipient} — ${subject}${links.length ? ` → ${links.join(' ')}` : ''}`);
  }
}

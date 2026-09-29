import { Injectable, Logger } from '@nestjs/common';
import { MessageProvider, type MessageToSend } from './message.provider.js';

@Injectable()
export class MockWhatsappProvider extends MessageProvider {
  override readonly channel = 'whatsapp';
  private readonly logger = new Logger(MockWhatsappProvider.name);

  async send(message: MessageToSend): Promise<string | undefined | void> {
    if (!message.requestId && !message.tenantId) {
      throw new Error(
        'WhatsappProvider exige requestId ou tenantId para identificar a Contabilidade (tenant).',
      );
    }

    this.logger.log(`[MOCK WHATSAPP] Enviando ${message.purpose} para ${message.recipient}...`);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Return a fake Meta message ID
    const fakeMessageId = `wamid.mock.${Date.now()}`;
    this.logger.log(`[MOCK WHATSAPP] Mensagem enviada com ID: ${fakeMessageId}`);
    return fakeMessageId;
  }
}

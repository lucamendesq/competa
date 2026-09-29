import { Injectable, Logger } from '@nestjs/common';
import { WhatsappCryptoService } from '../../whatsapp/whatsapp-crypto.service.js';
import { WhatsappRepository } from '../../whatsapp/whatsapp.repository.js';
import { MessageProvider, type MessageToSend } from './message.provider.js';
import env from '../../../config/env.js';

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
}

@Injectable()
export class WhatsappProvider extends MessageProvider {
  override readonly channel = 'whatsapp';
  private readonly logger = new Logger(WhatsappProvider.name);

  constructor(
    private readonly repository: WhatsappRepository,
    private readonly crypto: WhatsappCryptoService,
  ) {
    super();
  }

  async send(message: MessageToSend): Promise<string | undefined | void> {
    let integration;

    if (message.tenantId) {
      integration = await this.repository.getIntegrationByTenantId(message.tenantId);
    } else if (message.requestId) {
      integration = await this.repository.getIntegrationByRequestId(message.requestId);
    } else {
      throw new Error('WhatsappProvider exige requestId ou tenantId para identificar a Contabilidade (tenant).');
    }

    if (!integration || integration.status !== 'active') {
      throw new Error('A Contabilidade não tem integração ativa com o WhatsApp.');
    }

    const token = this.crypto.decrypt(integration.accessToken);
    const to = this.normalizePhone(message.recipient);

    // Mapeamento ingênuo de template com base no propósito, assumindo pt_BR e aprovação prévia.
    const templateName = this.mapPurposeToTemplate(message.purpose);
    if (!templateName) {
      throw new Error(`Nenhum template WhatsApp mapeado para o propósito: ${message.purpose}`);
    }

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: message.subject }, // Parametro de fallback generico
            ],
          },
        ],
      },
    };

    const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${integration.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as MetaSendResponse;

    if (!response.ok) {
      this.logger.error('Falha na API do Meta:', data);
      throw new Error(data.error?.message || 'Erro desconhecido na API do WhatsApp');
    }

    // Retorna o ID da mensagem no Meta (para webhook tracking)
    return data.messages?.[0]?.id;
  }

  private normalizePhone(phone: string): string {
    const numbers = phone.replace(/\D/g, '');
    return numbers.startsWith('55') ? numbers : `55${numbers}`;
  }

  private mapPurposeToTemplate(purpose?: string): string | undefined {
    // Esses templates precisariam existir na conta WABA.
    switch (purpose) {
      case 'link_delivery':
        return 'competa_link_delivery';
      case 'reminder':
        return 'competa_reminder';
      case 'rejection':
        return 'competa_rejection';
      case 'completion':
        return 'competa_completion';
      case 'deadline_missed':
        return 'competa_deadline_missed';
      case 'test':
        return 'competa_test_message';
      default:
        return undefined;
    }
  }
}

import { Logger, Module } from '@nestjs/common';
import { WhatsappCryptoService } from './whatsapp-crypto.service.js';
import { WhatsappSettingsController } from './whatsapp-settings.controller.js';
import { WhatsappWebhookController } from './whatsapp-webhook.controller.js';
import { WhatsappProvider } from '../messaging/providers/whatsapp.provider.js';
import { MockWhatsappProvider } from '../messaging/providers/mock-whatsapp.provider.js';
import { WhatsappRepository } from './whatsapp.repository.js';
import env from '../../config/env.js';

const useMockWhatsapp = env.NODE_ENV !== 'production';
new Logger('WhatsappModule').log(useMockWhatsapp ? 'MockWhatsappProvider' : 'WhatsappProvider');

@Module({
  controllers: [WhatsappSettingsController, WhatsappWebhookController],
  providers: [
    WhatsappRepository,
    WhatsappCryptoService,
    {
      provide: 'WHATSAPP_PROVIDER',
      useClass: useMockWhatsapp ? MockWhatsappProvider : WhatsappProvider,
    },
  ],
  exports: [WhatsappRepository, WhatsappCryptoService, 'WHATSAPP_PROVIDER'],
})
export class WhatsappModule {}

import { Body, Controller, Delete, Get, Post, Inject } from '@nestjs/common';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import {
  whatsappOnboardSchema,
  type WhatsappOnboardRequest,
  whatsappTestSendSchema,
  type WhatsappTestSendRequest,
} from '@competa/contracts';
import { WhatsappCryptoService } from './whatsapp-crypto.service.js';
import { WhatsappRepository } from './whatsapp.repository.js';
import env from '../../config/env.js';
import { MessageProvider } from '../messaging/providers/message.provider.js';

@Controller('whatsapp')
export class WhatsappSettingsController {
  constructor(
    private readonly repository: WhatsappRepository,
    private readonly crypto: WhatsappCryptoService,
    @Inject('WHATSAPP_PROVIDER') private readonly whatsapp: MessageProvider,
  ) {}

  @Get('status')
  async getStatus(@CurrentScope() scope: FirmScope) {
    const integration = await this.repository.getIntegrationByFirm(scope);
    if (!integration) {
      return { status: 'not_connected' };
    }

    return {
      status: integration.status,
      displayPhoneNumber: integration.displayPhoneNumber,
      wabaId: integration.wabaId,
    };
  }

  @Post('onboard')
  async onboard(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(whatsappOnboardSchema)) body: WhatsappOnboardRequest,
  ) {
    // 1. Exchanging auth code for long-lived token (Meta Embedded Signup)
    void body.code;
    const accessToken = 'mock_long_lived_token';
    const wabaId = 'mock_waba_id';
    const phoneNumberId = 'mock_phone_number_id';
    const displayPhoneNumber = '5511999999999';

    if (env.META_APP_ID && env.META_APP_SECRET) {
      // In a real implementation:
      // const tokenResponse = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/oauth/access_token...`)
      // For this step, since it's just a backend setup according to the plan, we assume success.
    }

    const encryptedToken = this.crypto.encrypt(accessToken);

    await this.repository.upsertIntegration(scope, {
      wabaId,
      phoneNumberId,
      displayPhoneNumber,
      accessToken: encryptedToken,
    });

    return { status: 'active', displayPhoneNumber, wabaId };
  }

  @Post('test')
  async test(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(whatsappTestSendSchema)) body: WhatsappTestSendRequest,
  ) {
    const integration = await this.repository.getIntegrationByFirm(scope);

    if (!integration || integration.status !== 'active') {
      throw new Error('Integração não ativa');
    }

    try {
      await this.whatsapp.send({
        tenantId: scope,
        recipient: body.phone,
        subject: 'Teste de Integração WhatsApp',
        body: 'Olá! Esta é uma mensagem de teste da integração do Competa. Se você a recebeu, está tudo pronto para usar.',
        purpose: 'test',
      });
    } catch (err) {
      throw new Error('Falha no envio de teste: ' + String(err));
    }

    return { success: true };
  }

  @Delete()
  async disconnect(@CurrentScope() scope: FirmScope) {
    await this.repository.deleteIntegration(scope);
    return { success: true };
  }
}

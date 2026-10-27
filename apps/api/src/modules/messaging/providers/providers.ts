import { Effect } from 'effect';
import env from '../../../config/env.js';
import { Logger } from '../../../lib/logger.js';
import { LogEmail } from './log-email.provider.js';
import type { MessageProvider } from './message.provider.js';
import { MockWhatsappProvider } from './mock-whatsapp.provider.js';
import type { PushProvider } from './push.provider.js';
import { ResendEmail } from './resend-email.provider.js';
import { ConsolePushProvider, WebPushProvider } from './web-push.provider.js';
import { WhatsappProvider, type WhatsappIntegrations } from './whatsapp.provider.js';
import { WhatsappCryptoService } from '../../whatsapp/whatsapp-crypto.service.js';
import type { WhatsappRepo } from '../../whatsapp/whatsapp.repo.js';

const useResend = env.NODE_ENV === 'production';
const useWebPush = env.NODE_ENV === 'production';

const logger = new Logger('MessageProviders');
logger.log(useResend ? 'ResendEmail' : 'LogEmail (console)');
logger.log(useWebPush ? 'WebPushProvider' : 'ConsolePushProvider (console)');

/** Instância única de cada canal no processo — o seam que o `MessagingModule` era. A
 *  escolha por `NODE_ENV` aparecia em dois lugares (o módulo Nest e o `make` do
 *  `MessagesRepo`), e em produção abria DOIS clientes Resend. */
export const emailProvider: MessageProvider = useResend ? new ResendEmail() : new LogEmail();

export const pushProvider: PushProvider = useWebPush
  ? new WebPushProvider()
  : new ConsolePushProvider();

/** As consultas de integração de um `WhatsappRepo` já montado, na forma que o provider usa. */
export const integrationsFrom = (repo: WhatsappRepo['Service']): WhatsappIntegrations => ({
  byTenant: (tenantId) => Effect.runPromise(repo.getIntegrationByTenantId(tenantId)),
  byRequest: (requestId) => Effect.runPromise(repo.getIntegrationByRequestId(requestId)),
});

/** Fora de produção o WhatsApp é o mock; em produção, o provider real sobre as integrações
 *  que quem chama sabe consultar. */
export const makeWhatsappProvider = (integrations: WhatsappIntegrations): MessageProvider =>
  useResend
    ? new WhatsappProvider(new WhatsappCryptoService(), integrations)
    : new MockWhatsappProvider();

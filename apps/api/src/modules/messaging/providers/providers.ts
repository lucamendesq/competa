import env from '../../../config/env.js';
import { Logger } from '../../../lib/logger.js';
import { LogEmail } from './log-email.provider.js';
import type { MessageProvider } from './message.provider.js';
import { MockWhatsappProvider } from './mock-whatsapp.provider.js';
import type { PushProvider } from './push.provider.js';
import { ResendEmail } from './resend-email.provider.js';
import { ConsolePushProvider, WebPushProvider } from './web-push.provider.js';

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

let whatsapp: MessageProvider | undefined = useResend ? undefined : new MockWhatsappProvider();

/* `import()` e não `import`: o `WhatsappProvider` de produção depende do `runtime.ts`, que
 * depende do `message.repo.ts`, que depende deste arquivo — estático, o ciclo quebra
 * conforme quem carregue primeiro. Só o ramo de produção paga. */
export const whatsappProviderOf = async (): Promise<MessageProvider> => {
  if (whatsapp) return whatsapp;

  const [{ WhatsappProvider }, { WhatsappCryptoService }] = await Promise.all([
    import('./whatsapp.provider.js'),
    import('../../whatsapp/whatsapp-crypto.service.js'),
  ]);

  whatsapp = new WhatsappProvider(new WhatsappCryptoService());
  return whatsapp;
};

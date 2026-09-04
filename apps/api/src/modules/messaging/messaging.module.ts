import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import env from '../../config/env.js';
import { RequestsModule } from '../requests/requests.module.js';
import { ContactsModule } from '../contacts/contacts.module.js';
import { setMagicLinkSender } from '../../infra/auth/magic-link-sender.js';
import { WebPush } from './providers/web-push.provider.js';
import { magicLinkEmail } from './email-body.js';
import { MessageRepository } from './message.repository.js';
import { MessagesController } from './messages.controller.js';
import { LogEmail } from './providers/log-email.provider.js';
import { MessageProvider } from './providers/message.provider.js';
import { ResendEmail } from './providers/resend-email.provider.js';
import { RemindersCron } from './reminders.cron.js';
import { RequestCreatedListener } from './request-created.listener.js';
import { CollectionEventsListener } from './collection-events.listener.js';

const useResend = Boolean(env.RESEND_API_KEY);

new Logger('MessagingModule').log(useResend ? 'ResendEmail' : 'LogEmail (fallback de dev)');

/** Fase 5 — envio de mensagens (email/WhatsApp/push) e cron de lembretes. */
@Module({
  // para rotacionar o Link no lembrete (o token em claro só existe na rotação).
  // Sem ciclo: RequestsModule importa apenas StorageModule.
  imports: [RequestsModule, ContactsModule],
  controllers: [MessagesController],
  providers: [
    { provide: MessageProvider, useClass: useResend ? ResendEmail : LogEmail },
    MessageRepository,
    RemindersCron,
    RequestCreatedListener,
    CollectionEventsListener,
    WebPush,
  ],
  exports: [MessageRepository],
})
export class MessagingModule implements OnModuleInit {
  constructor(private readonly messages: MessageRepository) {}

  /** Liga o magic link do Better Auth (que é montado fora da DI) ao provedor de email
   *  deste módulo — é ele quem trata falha de canal. Ver `infra/auth/magic-link-sender.ts`. */
  onModuleInit() {
    setMagicLinkSender(async ({ email, url }) => {
      await this.messages.sendWithoutLog({ recipient: email, ...magicLinkEmail({ email, url }) });
    });
  }
}

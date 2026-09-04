import { Logger, Module } from '@nestjs/common';
import env from '../../config/env.js';
import { RequestsModule } from '../requests/requests.module.js';
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
  imports: [RequestsModule],
  controllers: [MessagesController],
  providers: [
    { provide: MessageProvider, useClass: useResend ? ResendEmail : LogEmail },
    MessageRepository,
    RemindersCron,
    RequestCreatedListener,
    CollectionEventsListener,
  ],
  exports: [MessageRepository],
})
export class MessagingModule {}

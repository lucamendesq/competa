import { Service, inject } from '@angular/core';
import { Api, pageResource } from '../../core/http/api';

export type Message = {
  id: string;
  requestId: string;
  periodId: string;
  companyName: string;
  channel: string;
  purpose: string;
  recipient: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  sentAt: string | null;
  error: string | null;
  createdAt: string;
};

export const PURPOSE_LABEL: Record<string, string> = {
  link_delivery: 'Link inicial',
  reminder: 'Lembrete',
  rejection: 'Reenvio por rejeição',
  deadline_missed: 'Prazo estourado',
  completion: 'Solicitação completa',
};

export const STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila',
  sent: 'Enviada',
  delivered: 'Entregue',
  failed: 'Falhou',
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  push: 'Push',
};

@Service()
export class MessagesService {
  private readonly api = inject(Api);

  list(
    params: () => {
      page: number;
      perPage: number;
      periodId?: string;
      companyId?: string;
      channel?: string;
      purpose?: string;
      status?: string;
    },
  ) {
    return pageResource<Message>(() => '/messages', params);
  }

  resend(messageId: string) {
    return this.api.post<{ sent: boolean }>(`/messages/${messageId}/resend`);
  }

  runReminders() {
    return this.api.post<unknown>('/messages/reminders/run');
  }
}

import type {
  MessageChannel,
  MessagePurpose,
  MessageStatus,
} from '@/features/messages/api/message.types';

export const CHANNEL_LABEL: Record<MessageChannel, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  push: 'Push',
};

export const PURPOSE_LABEL: Record<MessagePurpose, string> = {
  link_delivery: 'Envio do link',
  resend: 'Reenvio do link',
  reminder: 'Lembrete',
  rejection: 'Recusa',
  deadline_missed: 'Prazo vencido',
  completion: 'Conclusão',
};

export const STATUS_LABEL: Record<MessageStatus, string> = {
  queued: 'Na fila',
  sent: 'Enviada',
  delivered: 'Entregue',
  failed: 'Falhou',
};

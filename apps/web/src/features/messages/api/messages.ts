import { api } from '@/api/client';
import type {
  MESSAGE_CHANNELS,
  MESSAGE_PURPOSES,
  MESSAGE_STATUS,
  MessageListQuery,
} from '@competa/contracts';

export type Message = {
  id: string;
  requestId: string;
  periodId: string;
  companyName: string;
  channel: (typeof MESSAGE_CHANNELS)[number];
  purpose: (typeof MESSAGE_PURPOSES)[number];
  recipient: string;
  status: (typeof MESSAGE_STATUS)[number];
  sentAt: string | null;
  error: string | null;
  createdAt: string;
};

export const getMessages = (params: Partial<MessageListQuery>) =>
  api.page<Message>('/messages', params);

export const resendMessage = (messageId: string) =>
  api.post<{ sent: boolean }>(`/messages/${messageId}/resend`);

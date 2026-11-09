import type { MessageListQuery } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { Message } from '@/features/messages/api/message.types';

export const getMessages = (query: MessageListQuery, signal?: AbortSignal) =>
  api.page<Message>('/messages', { params: query, ...(signal ? { signal } : {}) });

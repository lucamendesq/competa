import type { MessageListQuery } from '@competa/contracts';

export const messageKeys = {
  all: ['messages'] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  list: (query: MessageListQuery) => [...messageKeys.lists(), query] as const,
  companyOptions: () => [...messageKeys.all, 'company-options'] as const,
};

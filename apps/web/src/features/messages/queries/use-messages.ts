import type { MessageListQuery } from '@competa/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getCompanyFilterOptions } from '@/features/messages/api/get-company-filter-options';
import { getMessages } from '@/features/messages/api/get-messages';
import { messageKeys } from '@/features/messages/queries/message-keys';

export const useMessages = (query: MessageListQuery) =>
  useQuery({
    queryKey: messageKeys.list(query),
    queryFn: ({ signal }) => getMessages(query, signal),
    placeholderData: keepPreviousData,
  });

export const useCompanyFilterOptions = () =>
  useQuery({
    queryKey: messageKeys.companyOptions(),
    queryFn: ({ signal }) => getCompanyFilterOptions(signal),
    select: (page) => page.data,
  });

import { api } from '@/shared/lib/api-client';

export type AccountantOption = { id: string; name: string };

export const getAccountantOptions = (signal?: AbortSignal) =>
  api.get<AccountantOption[]>('/accountants', signal ? { signal } : {});

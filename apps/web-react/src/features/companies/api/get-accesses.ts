import { api } from '@/shared/lib/api-client';
import type { Contact } from '@/features/companies/api/company.types';

export const getAccesses = (id: string, signal?: AbortSignal) =>
  api.get<Contact[]>(`/companies/${id}/contacts/access`, signal ? { signal } : {});

import type { ContactBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { Contact } from '@/features/companies/api/company.types';

export const addContact = (companyId: string, body: ContactBody) =>
  api.post<Contact>(`/companies/${companyId}/contacts`, body);

export const updateContact = (companyId: string, contactId: string, body: Partial<ContactBody>) =>
  api.patch<Contact & { undeliveredLinks: number }>(
    `/companies/${companyId}/contacts/${contactId}`,
    body,
  );

export const removeContact = (companyId: string, contactId: string) =>
  api.delete<void>(`/companies/${companyId}/contacts/${contactId}`);

export const revokeAccess = (companyId: string, contactId: string) =>
  api.delete<{ revoked: boolean }>(`/companies/${companyId}/contacts/${contactId}/access`);

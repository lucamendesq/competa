import { api } from '@/api/client';

export type TeamAccountant = {
  id: string;
  name: string;
  email: string;
  owner: boolean;
  createdAt: string;
};

export type PendingInvite = {
  id: string;
  email: string;
  expiresAt: string;
};

export const getAccountants = () => api.get<TeamAccountant[]>('/accountants');

export const removeAccountant = (id: string) => api.delete<{ removed: true }>(`/accountants/${id}`);

export const getPendingInvites = () => api.get<PendingInvite[]>('/invites');

export const createInvite = (email: string) =>
  api.post<{ id: string; email: string; url: string }>('/invites', { email });

export const revokeInvite = (id: string) => api.delete<{ revoked: true }>(`/invites/${id}`);

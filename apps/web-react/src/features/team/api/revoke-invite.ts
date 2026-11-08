import { api } from '@/shared/lib/api-client';

export const revokeInvite = (id: string) => api.delete<{ revoked: true }>(`/invites/${id}`);

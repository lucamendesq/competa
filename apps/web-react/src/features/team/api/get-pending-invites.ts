import { api } from '@/shared/lib/api-client';
import type { PendingInvite } from '@/features/team/api/team.types';

export const getPendingInvites = (signal?: AbortSignal) =>
  api.get<PendingInvite[]>('/invites', signal ? { signal } : {});

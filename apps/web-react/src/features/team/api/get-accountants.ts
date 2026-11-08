import { api } from '@/shared/lib/api-client';
import type { TeamAccountant } from '@/features/team/api/team.types';

export const getAccountants = (signal?: AbortSignal) =>
  api.get<TeamAccountant[]>('/accountants', signal ? { signal } : {});

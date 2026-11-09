import { api } from '@/shared/lib/api-client';
import type { CreatedInvite } from '@/features/team/api/team.types';

export const createInvite = (email: string) => api.post<CreatedInvite>('/invites', { email });

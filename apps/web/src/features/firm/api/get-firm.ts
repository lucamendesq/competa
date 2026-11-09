import { api } from '@/shared/lib/api-client';
import type { Firm } from '@/features/firm/api/firm.types';

export const getFirm = (signal?: AbortSignal) =>
  api.get<Firm>('/accounting-firm', signal ? { signal } : {});

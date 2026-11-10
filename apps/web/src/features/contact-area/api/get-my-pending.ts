import { api } from '@/shared/lib/api-client';
import type { MyPendingItem } from '@/features/contact-area/api/contact-area.types';

export const getMyPending = (signal?: AbortSignal) =>
  api.get<MyPendingItem[]>('/my/pending', signal ? { signal } : {});

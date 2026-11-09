import { RequestDetailResponse } from '@competa/contracts';
import { api, parsed } from '@/shared/lib/api-client';

export const getRequest = async (requestId: string, signal?: AbortSignal) =>
  parsed(RequestDetailResponse)(
    await api.get<unknown>(`/requests/${requestId}`, signal ? { signal } : {}),
  );

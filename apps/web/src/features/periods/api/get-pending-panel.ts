import { PanelRowResponse } from '@competa/contracts';
import { api, parsed } from '@/shared/lib/api-client';

export const getPendingPanel = async (id: string, signal?: AbortSignal) =>
  parsed(PanelRowResponse.array())(
    await api.get<unknown>(`/periods/${id}/pending-panel`, signal ? { signal } : {}),
  );

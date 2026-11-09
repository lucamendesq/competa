import { api } from '@/shared/lib/api-client';

export const undoAccept = (requestItemId: string) =>
  api.post<{ requestId: string; requestStatus: string }>(
    `/request-items/${requestItemId}/undo-accept`,
  );

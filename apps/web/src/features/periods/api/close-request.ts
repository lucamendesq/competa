import { api } from '@/shared/lib/api-client';
import type { RequestClosing } from '@/features/periods/api/period.types';

export const closeRequest = (requestId: string) =>
  api.post<RequestClosing>(`/requests/${requestId}/close`);

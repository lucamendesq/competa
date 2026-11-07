import { api } from '@/shared/lib/api-client';

export const resendUploadLink = (requestId: string) =>
  api.post<{ contactEmail: string }>(`/requests/${requestId}/upload-link/resend`);

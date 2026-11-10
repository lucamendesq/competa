import { api } from '@/shared/lib/api-client';

export const resendMessage = (messageId: string) =>
  api.post<{ sent: boolean }>(`/messages/${messageId}/resend`);

import { api } from '@/shared/lib/api-client';
import type { WhatsAppConnection } from '@/features/whatsapp/api/whatsapp.types';

export const getWhatsAppStatus = (signal?: AbortSignal) =>
  api.get<WhatsAppConnection>('/whatsapp/status', signal ? { signal } : {});

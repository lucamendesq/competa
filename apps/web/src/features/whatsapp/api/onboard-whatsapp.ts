import { api } from '@/shared/lib/api-client';
import type { WhatsAppConnection } from '@/features/whatsapp/api/whatsapp.types';

export const onboardWhatsApp = () =>
  api.post<WhatsAppConnection>('/whatsapp/onboard', { code: 'mock_code' });

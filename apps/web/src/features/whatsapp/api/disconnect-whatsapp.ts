import { api } from '@/shared/lib/api-client';

export const disconnectWhatsApp = () => api.delete<unknown>('/whatsapp');

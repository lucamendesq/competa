import { api } from '@/shared/lib/api-client';

export const testWhatsApp = (phone: string) => api.post<unknown>('/whatsapp/test', { phone });

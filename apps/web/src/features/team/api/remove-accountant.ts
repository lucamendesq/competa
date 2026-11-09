import { api } from '@/shared/lib/api-client';

export const removeAccountant = (id: string) => api.delete<{ removed: true }>(`/accountants/${id}`);

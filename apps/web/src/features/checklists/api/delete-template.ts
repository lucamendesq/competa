import { api } from '@/shared/lib/api-client';

export const deleteTemplate = (id: string) => api.delete<void>(`/checklist-templates/${id}`);

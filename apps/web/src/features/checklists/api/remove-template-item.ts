import { api } from '@/shared/lib/api-client';

export const removeTemplateItem = (templateId: string, itemId: string) =>
  api.delete<void>(`/checklist-templates/${templateId}/items/${itemId}`);

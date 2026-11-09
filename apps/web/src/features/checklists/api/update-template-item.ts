import type { UpdateTemplateItemBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { TemplateItem } from '@/features/checklists/api/template.types';

export const updateTemplateItem = (
  templateId: string,
  itemId: string,
  body: UpdateTemplateItemBody,
) => api.patch<TemplateItem>(`/checklist-templates/${templateId}/items/${itemId}`, body);

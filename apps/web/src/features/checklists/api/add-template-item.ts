import type { CreateTemplateItemBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { TemplateItem } from '@/features/checklists/api/template.types';

export const addTemplateItem = (templateId: string, body: CreateTemplateItemBody) =>
  api.post<TemplateItem>(`/checklist-templates/${templateId}/items`, body);

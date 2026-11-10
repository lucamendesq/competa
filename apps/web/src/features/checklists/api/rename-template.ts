import { api } from '@/shared/lib/api-client';
import type { TemplateDetail } from '@/features/checklists/api/template.types';

export const renameTemplate = (id: string, name: string) =>
  api.patch<TemplateDetail>(`/checklist-templates/${id}`, { name });

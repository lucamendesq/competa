import { api } from '@/shared/lib/api-client';
import type { TemplateDetail } from '@/features/checklists/api/template.types';

export const getTemplate = (id: string, signal?: AbortSignal) =>
  api.get<TemplateDetail>(`/checklist-templates/${id}`, signal ? { signal } : {});

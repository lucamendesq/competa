import { api } from '@/shared/lib/api-client';
import type { TemplatePreview } from '@/features/catalog/api/catalog.types';

export const getTemplatePreview = (id: string, signal?: AbortSignal) =>
  api.get<TemplatePreview>(`/checklist-templates/${id}`, signal ? { signal } : {});

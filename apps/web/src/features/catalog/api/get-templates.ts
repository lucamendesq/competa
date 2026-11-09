import { api } from '@/shared/lib/api-client';
import type { TemplateOption } from '@/features/catalog/api/catalog.types';

export const getTemplates = (signal?: AbortSignal) =>
  api.get<TemplateOption[]>('/checklist-templates', signal ? { signal } : {});

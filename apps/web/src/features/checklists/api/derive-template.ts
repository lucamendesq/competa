import { api } from '@/shared/lib/api-client';
import type { CreatedTemplate } from '@/features/checklists/api/template.types';

export const deriveTemplate = (id: string, name?: string) =>
  api.post<CreatedTemplate>(`/checklist-templates/${id}/derive`, name ? { name } : {});

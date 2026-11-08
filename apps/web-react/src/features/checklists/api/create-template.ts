import { api } from '@/shared/lib/api-client';
import type { CreatedTemplate } from '@/features/checklists/api/template.types';

export const createTemplate = (name: string) =>
  api.post<CreatedTemplate>('/checklist-templates', { name });

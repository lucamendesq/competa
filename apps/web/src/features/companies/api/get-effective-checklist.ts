import { api } from '@/shared/lib/api-client';
import type { EffectiveChecklist } from '@/features/companies/api/company.types';

export const getEffectiveChecklist = (id: string, signal?: AbortSignal) =>
  api.get<EffectiveChecklist>(`/companies/${id}/checklist`, signal ? { signal } : {});

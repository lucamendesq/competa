import { api } from '@/shared/lib/api-client';
import type { Override } from '@/features/companies/api/company.types';

export const getOverrides = (id: string, signal?: AbortSignal) =>
  api.get<Override[]>(`/companies/${id}/checklist-overrides`, signal ? { signal } : {});

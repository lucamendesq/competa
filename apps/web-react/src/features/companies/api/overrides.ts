import type { CreateOverrideBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { Override } from '@/features/companies/api/company.types';

export const saveOverride = (companyId: string, body: CreateOverrideBody) =>
  api.put<Override>(`/companies/${companyId}/checklist-overrides`, body);

export const removeOverride = (companyId: string, documentTypeId: string) =>
  api.delete<void>(`/companies/${companyId}/checklist-overrides/${documentTypeId}`);

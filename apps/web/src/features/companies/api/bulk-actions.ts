import { api } from '@/shared/lib/api-client';
import type { AccessInviteResult } from '@/features/companies/api/company.types';

export const sendAccessInvites = (companyIds: string[]) =>
  api.post<{ invited: number; skipped: number; results: AccessInviteResult[] }>(
    '/companies/access-invites',
    {
      companyIds,
    },
  );

export const applyTemplate = (companyIds: string[], checklistTemplateId: string) =>
  api.post<{ updated: number }>('/companies/apply-template', { companyIds, checklistTemplateId });

export const activateCompanies = (companyIds: string[]) =>
  api.post<{ activated: number; skipped: number; reason?: string }>('/companies/activate', {
    companyIds,
  });

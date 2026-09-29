import { api } from '@/api/client';
import type {
  CompanyDetailResponse,
  CompanyFlags,
  CompanySummaryResponse,
  ContactBody,
  ContactDetailResponse,
  CreateCompanyBody,
  CreateOverrideBody,
  UpdateCompanyBody,
} from '@competa/contracts';

export type Company = CompanySummaryResponse;
export type Contact = ContactDetailResponse;
export type CompanyDetail = CompanyDetailResponse;

export type ChecklistLine = {
  documentTypeId: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: 'monthly' | 'annual' | 'on_demand';
  annualMonth: number | null;
  dueDay: number | null;
  dueMonthOffset: number;
  conditionFlag: string | null;
  required: boolean;
  source: 'template' | 'override';
  applies: boolean;
};

export type EffectiveChecklist = {
  companyId: string;
  template: { id: string; name: string } | null;
  flags: CompanyFlags;
  items: ChecklistLine[];
};

export type Override = {
  id: string;
  action: 'add' | 'remove';
  documentTypeId: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: string | null;
  annualMonth: number | null;
  dueDay: number | null;
  dueMonthOffset: number | null;
  conditionFlag: string | null;
  required: boolean | null;
};

export type ImportLine =
  | { line: number; status: 'created'; companyId: string; name: string }
  | { line: number; status: 'error'; name: string; error: string };

export type ImportResult = {
  total: number;
  created: number;
  failed: number;
  lines: ImportLine[];
};

export type PendingImportRow = { line: number; body: CreateCompanyBody };

export type ImportPreviewLine =
  | ({ status: 'pending'; name: string } & PendingImportRow)
  | { line: number; status: 'error'; name: string; error: string };

export type ImportPreviewResult = {
  total: number;
  failed: number;
  lines: ImportPreviewLine[];
};

export const getCompaniesList = (params: {
  page: number;
  perPage: number;
  active?: string;
  search?: string;
}) => api.page<Company>('/companies', params);

export const getCompanyDetail = (id: string) => api.get<CompanyDetail>(`/companies/${id}`);

export const getEffectiveChecklist = (id: string) =>
  api.get<EffectiveChecklist>(`/companies/${id}/checklist`);

export const getOverrides = (id: string) =>
  api.get<Override[]>(`/companies/${id}/checklist-overrides`);

export const getAccesses = (id: string) => api.get<Contact[]>(`/companies/${id}/contacts/access`);

export const createCompany = (body: CreateCompanyBody) =>
  api.post<CompanyDetail>('/companies', body);

export const updateCompany = (id: string, body: UpdateCompanyBody) =>
  api.patch<Company>(`/companies/${id}`, body);

export const deactivateCompany = (id: string) => api.delete<Company>(`/companies/${id}`);

export const addContact = (companyId: string, body: ContactBody) =>
  api.post<Contact>(`/companies/${companyId}/contacts`, body);

export const updateContact = (companyId: string, contactId: string, body: Partial<ContactBody>) =>
  api.patch<Contact>(`/companies/${companyId}/contacts/${contactId}`, body);

export const removeContact = (companyId: string, contactId: string) =>
  api.delete<void>(`/companies/${companyId}/contacts/${contactId}`);

export const revokeAccess = (companyId: string, contactId: string) =>
  api.delete<{ revoked: boolean }>(`/companies/${companyId}/contacts/${contactId}/access`);

export const saveOverride = (companyId: string, body: CreateOverrideBody) =>
  api.put<Override>(`/companies/${companyId}/checklist-overrides`, body);

export const removerOverride = (companyId: string, documentTypeId: string) =>
  api.delete<void>(`/companies/${companyId}/checklist-overrides/${documentTypeId}`);

export const sendAccessInvites = (companyIds: string[]) =>
  api.post<{ invited: number; skipped: number }>('/companies/access-invites', { companyIds });

export const applyTemplate = (companyIds: string[], checklistTemplateId: string) =>
  api.post<{ updated: number }>('/companies/apply-template', { companyIds, checklistTemplateId });

export const importCsv = (csv: string) =>
  api.post<ImportPreviewResult>('/companies/import', { csv });

export const confirmImport = (pending: PendingImportRow[]) =>
  api.post<ImportResult>('/companies/import/confirm', { pending });

import { Service, inject } from '@angular/core';
import type {
  CompanyFlags,
  ContactBody,
  CreateCompanyBody,
  CreateOverrideBody,
  UpdateCompanyBody,
} from '@contabilidade/contracts';
import { Api, apiResource, pageResource } from '../../core/http/api';

export type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  flags: CompanyFlags;
  active: boolean;
  checklistTemplateId: string;
  templateName: string;
  contactCount: number;
  /** Responsáveis que recebem o email da abertura (nome e email). */
  contacts: { id: string; name: string; email: string }[];
  /** Responsáveis que ativaram a conta. Opcional: a Empresa é cobrada pelo link sem ela. */
  readyContactCount: number;
};

export type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hasAccess?: boolean;
};

export type CompanyDetail = Omit<Company, 'contactCount' | 'contacts'> & {
  contacts: Contact[];
};

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
  template: { id: string; name: string };
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

@Service()
export class CompaniesService {
  private readonly api = inject(Api);

  list(params: () => { page: number; perPage: number; active?: string }) {
    return pageResource<Company>(() => '/companies', params);
  }

  detail(id: () => string | undefined) {
    return apiResource<CompanyDetail>(() => {
      const value = id();
      return value ? `/companies/${value}` : undefined;
    });
  }

  effectiveChecklist(id: () => string | undefined) {
    return apiResource<EffectiveChecklist>(() => {
      const value = id();
      return value ? `/companies/${value}/checklist` : undefined;
    });
  }

  overrides(id: () => string | undefined) {
    return apiResource<Override[]>(() => {
      const value = id();
      return value ? `/companies/${value}/checklist-overrides` : undefined;
    });
  }

  accesses(id: () => string | undefined) {
    return apiResource<Contact[]>(() => {
      const value = id();
      return value ? `/companies/${value}/contacts/access` : undefined;
    });
  }

  create(body: CreateCompanyBody) {
    return this.api.post<CompanyDetail>('/companies', body);
  }

  update(id: string, body: UpdateCompanyBody) {
    return this.api.patch<Company>(`/companies/${id}`, body);
  }

  deactivate(id: string) {
    return this.api.delete<Company>(`/companies/${id}`);
  }

  addContact(companyId: string, body: ContactBody) {
    return this.api.post<Contact>(`/companies/${companyId}/contacts`, body);
  }

  updateContact(companyId: string, contactId: string, body: Partial<ContactBody>) {
    return this.api.patch<Contact>(`/companies/${companyId}/contacts/${contactId}`, body);
  }

  removeContact(companyId: string, contactId: string) {
    return this.api.delete<void>(`/companies/${companyId}/contacts/${contactId}`);
  }

  revokeAccess(companyId: string, contactId: string) {
    return this.api.delete<{ revoked: boolean }>(
      `/companies/${companyId}/contacts/${contactId}/access`,
    );
  }

  saveOverride(companyId: string, body: CreateOverrideBody) {
    return this.api.put<Override>(`/companies/${companyId}/checklist-overrides`, body);
  }

  removerOverride(companyId: string, documentTypeId: string) {
    return this.api.delete<void>(`/companies/${companyId}/checklist-overrides/${documentTypeId}`);
  }

  sendAccessInvites(companyIds: string[]) {
    return this.api.post<{ invited: number; skipped: number }>('/companies/access-invites', {
      companyIds,
    });
  }

  importCsv(csv: string) {
    return this.api.post<ImportResult>('/companies/import', { csv });
  }
}

import type {
  CompanyDetailResponse,
  CompanyFlags,
  CompanySummaryResponse,
  ContactDetailResponse,
  CreateCompanyBody,
  PaidPlanName,
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
  | {
      line: number;
      status: 'created';
      companyId: string;
      name: string;
      active: boolean;
      inserted: boolean;
    }
  | { line: number; status: 'error'; name: string; error: string };

export type ImportResult = {
  total: number;
  created: number;
  updated: number;
  activated: number;
  failed: number;
  lines: ImportLine[];
};

export type PendingImportRow = { line: number; body: CreateCompanyBody };

export type ImportPreviewLine =
  | ({ status: 'pending'; name: string; existingName?: string } & PendingImportRow)
  | { line: number; status: 'error'; name: string; error: string };

export type ImportPreviewResult = {
  total: number;
  failed: number;
  lines: ImportPreviewLine[];
};

export type AccessInviteResult = {
  companyId: string;
  companyName?: string;
  email?: string;
  status: 'invited' | 'skipped' | 'error';
  reason?: string;
};

export type PlanUsage = {
  planName: string;
  companiesActive: number;
  companiesInactive: number;
  companyCap: number;
  softCap: number;
  overCap: boolean;
  recommendedPlan: PaidPlanName;
};

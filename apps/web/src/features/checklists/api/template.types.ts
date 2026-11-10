import type { CompanyFlag, DocumentCategory, Periodicity } from '@competa/contracts';

export type TemplateItem = {
  id: string;
  documentTypeId: string;
  name: string;
  category: DocumentCategory;
  description: string | null;
  acceptedFormats: string[];
  periodicity: Periodicity;
  annualMonth: number | null;
  dueDay: number | null;
  dueMonthOffset: number;
  conditionFlag: CompanyFlag | null;
  required: boolean;
};

export type TemplateDetail = {
  id: string;
  name: string;
  derivedFrom: string | null;
  accountingFirmId: string | null;
  items: TemplateItem[];
};

export type CreatedTemplate = {
  id: string;
  name: string;
  derivedFrom: string | null;
  isProduct: boolean;
  itemCount: number;
  companyCount: number;
};

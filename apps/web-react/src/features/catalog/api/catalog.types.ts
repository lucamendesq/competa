import type { DocumentCategory } from '@competa/contracts';

export type TemplateOption = {
  id: string;
  name: string;
  derivedFrom: string | null;
  isProduct: boolean;
  itemCount: number;
  companyCount: number;
};

export type DocumentType = {
  id: string;
  name: string;
  category: DocumentCategory;
  acceptedFormats: string[];
  description: string | null;
  isProduct: boolean;
};

export type TemplatePreviewItem = {
  id: string;
  name: string;
  category: string;
  periodicity: string;
  conditionFlag: string | null;
};

export type TemplatePreview = { id: string; name: string; items: TemplatePreviewItem[] };

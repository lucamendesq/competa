import { api } from '@/api/client'
import type {
  CompanyFlag,
  CreateTemplateItemBody,
  DocumentCategory,
  Periodicity,
  UpdateTemplateItemBody,
} from '@competa/contracts'

export type Template = {
  id: string;
  name: string;
  derivedFrom: string | null;
  isProduct: boolean;
  itemCount: number;
  companyCount: number;
};

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

export type DocumentType = {
  id: string;
  name: string;
  category: DocumentCategory;
  acceptedFormats: string[];
  description: string | null;
  isProduct: boolean;
};

export const getTemplates = () =>
  api.get<Template[]>('/checklist-templates')

export const getTemplateDetail = (id: string) =>
  api.get<TemplateDetail>(`/checklist-templates/${id}`)

export const getDocumentTypes = (params: { page: number; perPage: number; category?: string }) =>
  api.page<DocumentType>('/document-types', params)

export const renameTemplate = (id: string, name: string) =>
  api.patch<TemplateDetail>(`/checklist-templates/${id}`, { name })

export const deriveTemplate = (id: string, name?: string) =>
  api.post<Template & { itemCount: number }>(`/checklist-templates/${id}/derive`, name ? { name } : {})

export const addItemToTemplate = (templateId: string, body: CreateTemplateItemBody) =>
  api.post<TemplateItem>(`/checklist-templates/${templateId}/items`, body)

export const updateTemplateItem = (templateId: string, itemId: string, body: UpdateTemplateItemBody) =>
  api.patch<TemplateItem>(`/checklist-templates/${templateId}/items/${itemId}`, body)

export const removeTemplateItem = (templateId: string, itemId: string) =>
  api.delete<void>(`/checklist-templates/${templateId}/items/${itemId}`)

export const deleteTemplate = (id: string) =>
  api.delete<void>(`/checklist-templates/${id}`)

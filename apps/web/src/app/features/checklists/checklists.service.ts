import { Service, inject } from '@angular/core';
import type {
  CompanyFlag,
  CreateTemplateItemBody,
  DocumentCategory,
  Periodicity,
  UpdateTemplateItemBody,
} from '@competa/contracts';
import { Api, apiResource, pageResource } from '../../core/http/api';

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

@Service()
export class ChecklistsService {
  private readonly api = inject(Api);

  templates() {
    return apiResource<Template[]>(() => '/checklist-templates');
  }

  template(id: () => string | undefined) {
    return apiResource<TemplateDetail>(() => {
      const value = id();
      return value ? `/checklist-templates/${value}` : undefined;
    });
  }

  documentTypes(params?: () => { page: number; perPage: number; category?: string }) {
    return pageResource<DocumentType>(
      () => '/document-types',
      params ?? (() => ({ page: 1, perPage: 100 })),
    );
  }

  rename(id: string, name: string) {
    return this.api.patch<TemplateDetail>(`/checklist-templates/${id}`, { name });
  }

  derive(id: string, name?: string) {
    return this.api.post<Template & { itemCount: number }>(
      `/checklist-templates/${id}/derive`,
      name ? { name } : {},
    );
  }

  addItem(templateId: string, body: CreateTemplateItemBody) {
    return this.api.post<TemplateItem>(`/checklist-templates/${templateId}/items`, body);
  }

  updateItem(templateId: string, itemId: string, body: UpdateTemplateItemBody) {
    return this.api.patch<TemplateItem>(`/checklist-templates/${templateId}/items/${itemId}`, body);
  }

  removeItem(templateId: string, itemId: string) {
    return this.api.delete<void>(`/checklist-templates/${templateId}/items/${itemId}`);
  }

  deleteTemplate(id: string) {
    return this.api.delete<void>(`/checklist-templates/${id}`);
  }
}

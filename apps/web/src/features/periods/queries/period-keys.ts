import type { PeriodListParams } from '@/features/periods/api/get-periods';

export const periodKeys = {
  all: ['periods'] as const,
  lists: () => [...periodKeys.all, 'list'] as const,
  list: (params: PeriodListParams) => [...periodKeys.lists(), params] as const,
  details: () => [...periodKeys.all, 'detail'] as const,
  detail: (id: string) => [...periodKeys.details(), id] as const,
  panel: (id: string) => [...periodKeys.detail(id), 'panel'] as const,
  preview: (referenceMonth: string) => [...periodKeys.all, 'preview', referenceMonth] as const,
  companyCnpjs: () => [...periodKeys.all, 'company-cnpjs'] as const,
};

export const requestKeys = {
  all: ['requests'] as const,
  detail: (id: string) => [...requestKeys.all, 'detail', id] as const,
  uploadLink: (id: string) => [...requestKeys.detail(id), 'upload-link'] as const,
};

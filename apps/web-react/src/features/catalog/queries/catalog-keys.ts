import type { DocumentTypeParams } from '@/features/catalog/api/get-document-types';

export const catalogKeys = {
  all: ['catalog'] as const,
  documentTypes: (params: DocumentTypeParams) =>
    [...catalogKeys.all, 'document-types', params] as const,
  templates: () => [...catalogKeys.all, 'templates'] as const,
};

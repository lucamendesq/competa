import { api } from '@/shared/lib/api-client';
import type { DocumentType } from '@/features/catalog/api/catalog.types';

export type DocumentTypeParams = { page: number; perPage: number; category?: string };

export const getDocumentTypes = (params: DocumentTypeParams, signal?: AbortSignal) =>
  api.page<DocumentType>('/document-types', { params, ...(signal ? { signal } : {}) });

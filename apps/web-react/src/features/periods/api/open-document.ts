import { api } from '@/shared/lib/api-client';

export const openDocument = (documentId: string) => api.blobUrl(`/documents/${documentId}/content`);

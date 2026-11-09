import type { MyPresignBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { MyPresignedFile } from '@/features/contact-area/api/contact-area.types';

export const presignMyDocuments = (body: MyPresignBody) =>
  api.post<{ files: MyPresignedFile[] }>('/my/documents', body);

// `requestId` também aqui: o `ContactUploadGuard` resolve o escopo do envio pelo corpo.
export const confirmMyDocuments = (requestId: string, documentIds: string[]) =>
  api.post<{ refused: { documentId: string; fileName: string; reason: string }[] }>(
    '/my/documents/confirm',
    { requestId, documentIds },
  );

export const openMyDocument = (documentId: string) =>
  api.blobUrl(`/my/documents/${documentId}/content`);

export const downloadMyDocument = (documentId: string, fileName: string) =>
  api.download(`/my/documents/${documentId}/content`, fileName);

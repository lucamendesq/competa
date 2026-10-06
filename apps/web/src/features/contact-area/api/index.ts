import { api } from '@/api/client';
import type { MyPresignBody } from '@competa/contracts';

export const getMyPending = () => api.get<any[]>('/my/pending');

export const presignMyDocuments = (body: MyPresignBody) => 
  api.post<{ files: Array<{ fileName: string; accepted: boolean; reason?: string; documentId?: string; uploadUrl?: string }> }>('/my/documents', body);

export const confirmMyDocuments = (documentIds: string[]) =>
  api.post<{ refused: Array<{ documentId: string; fileName: string; reason: string }> }>('/my/documents/confirm', { documentIds });

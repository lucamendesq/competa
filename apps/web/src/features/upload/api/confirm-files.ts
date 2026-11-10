import { api } from '@/shared/lib/api-client';
import type { Confirmation } from '@/features/upload/api/upload.types';

export const confirmFiles = (token: string, documentIds: string[]) =>
  api.post<Confirmation>(`/upload/${token}/documents/confirm`, { documentIds });

import { api } from '@/shared/lib/api-client';
import type { FileToPresign, Presign } from '@/features/upload/api/upload.types';

export const presignFiles = (
  token: string,
  body: { requestItemId?: string | null; files: FileToPresign[] },
) => api.post<Presign>(`/upload/${token}/documents`, body);

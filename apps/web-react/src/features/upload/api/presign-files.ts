import { api } from '@/shared/lib/api-client';
import type { Presign } from '@/features/upload/api/upload.types';
import type { FileToPresign } from '@/shared/upload';

export const presignFiles = (
  token: string,
  body: { requestItemId?: string | null; files: FileToPresign[] },
) => api.post<Presign>(`/upload/${token}/documents`, body);

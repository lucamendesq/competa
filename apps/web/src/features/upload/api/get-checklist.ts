import { api } from '@/shared/lib/api-client';
import type { UploadChecklist } from '@/features/upload/api/upload.types';

export const getChecklist = (token: string, signal?: AbortSignal) =>
  api.get<UploadChecklist>(`/upload/${token}`, signal ? { signal } : {});

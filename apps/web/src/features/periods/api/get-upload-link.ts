import { api } from '@/shared/lib/api-client';
import type { UploadLink } from '@/features/periods/api/period.types';

/* Só o hash do token fica salvo na API: não existe "ver o link atual" sem gerar um novo.
 * Toda chamada rotaciona o link, e o anterior ainda vale por até 48 h. */
export const getUploadLink = (requestId: string) =>
  api.post<UploadLink>(`/requests/${requestId}/upload-link`);

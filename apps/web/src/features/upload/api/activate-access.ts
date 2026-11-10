import { api } from '@/shared/lib/api-client';
import type { AccessActivation } from '@/features/upload/api/upload.types';

// Ativar não devolve sessão nem aceita senha: o Link de Upload circula por e-mail
// encaminhado e log de proxy. A resposta é sempre "confira seu e-mail".
export const activateAccess = (token: string, body?: { name?: string }) =>
  api.post<AccessActivation>(`/upload/${token}/access`, body ?? {});

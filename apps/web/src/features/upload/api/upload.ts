import { api } from '@/api/client';
import { trackBusy } from '@/api/busy';
import type { PushSubscriptionPayload } from '@/composables/usePush'; // Need to port PushService

export type UploadedFile = {
  reviewStatus: 'pending' | 'accepted' | 'rejected';
  rejectionReason: string | null;
};

export type ChecklistItem = {
  id: string;
  name: string;
  description: string | null;
  acceptedFormats: string[];
  dueDate: string | null;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected';
  documents: UploadedFile[];
};

export type Checklist = {
  company: string;
  accountingFirm: string;
  /** Só vem preenchido no plano com a capability `branding`. */
  accountingFirmLogoUrl: string | null;
  hasAccess: boolean;
  referenceMonth: string;
  dueDate: string | null;
  status: 'open' | 'complete' | 'closed';
  items: ChecklistItem[];
  extraDocuments: UploadedFile[];
};

export type PresignedFile =
  | { fileName: string; accepted: false; reason: string }
  | {
      fileName: string;
      accepted: true;
      documentId: string;
      uploadUrl: string;
    };

export type Presign = { files: PresignedFile[] };

export type Confirmation = {
  confirmed: number;
  submittedItemIds: string[];
  refused: { documentId: string; fileName: string; reason: string }[];
};

export const getChecklist = (token: string) => api.get<Checklist>(`/upload/${token}`);

export const presignFiles = (
  token: string,
  body: {
    requestItemId?: string | null;
    files: { fileName: string; contentType: string; sizeBytes: number }[];
  },
) => api.post<Presign>(`/upload/${token}/documents`, body);

/* XHR em vez de fetch: só ele reporta o progresso do corpo enviado. A falha de rede vira o
 * mesmo `TypeError('Failed to fetch')` do fetch, que é o que `failureKind` lê como offline. */
export const putFileToStorage = (
  uploadUrl: string,
  file: File,
  onProgress?: (loadedBytes: number) => void,
) =>
  trackBusy(
    () =>
      new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (event) => onProgress?.(event.loaded);
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve(xhr.responseText)
            : reject(new Error(`PUT falhou com ${xhr.status}`));
        xhr.onerror = () => reject(new TypeError('Failed to fetch'));
        xhr.send(file);
      }),
  );

export const confirmFiles = (token: string, documentIds: string[]) =>
  api.post<Confirmation>(`/upload/${token}/documents/confirm`, { documentIds });

export const subscribePush = (token: string, subscription: PushSubscriptionPayload) =>
  api.post<{ id: string }>(`/upload/${token}/push`, subscription);

/** Ativar NÃO devolve sessão nem aceita senha: o Link de Upload circula por email
 *  encaminhado e log de proxy. A resposta é sempre "confira seu email". */
export const activateAccess = (token: string, body?: { name?: string }) =>
  api.post<{ email: string; name: string; nextStep: 'check_email' }>(
    `/upload/${token}/access`,
    body ?? {},
  );

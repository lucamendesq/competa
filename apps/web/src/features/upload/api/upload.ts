import { api } from '@/api/client';
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

export const putFileToStorage = async (uploadUrl: string, file: File) => {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
  if (!res.ok) throw new Error(`PUT falhou com ${res.status}`);
  return res.text();
};

export const confirmFiles = (token: string, documentIds: string[]) =>
  api.post<Confirmation>(`/upload/${token}/documents/confirm`, { documentIds });

export const subscribePush = (token: string, subscription: PushSubscriptionPayload) =>
  api.post<{ id: string }>(`/upload/${token}/push`, subscription);

export const activateAccess = (token: string) =>
  api.post<{ email: string; name: string; nextStep: 'check_email' }>(`/upload/${token}/access`, {});

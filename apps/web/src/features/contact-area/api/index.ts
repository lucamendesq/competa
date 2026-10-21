import { api } from '@/api/client';
import type { MyPresignBody } from '@competa/contracts';

/** Espelha o `GET /my/pending` de `contacts.controller.ts`. Esta é a área logada do
 *  Responsável, não o Link de Upload — por isso `fileName` aparece aqui: quem está
 *  autenticado é a pessoa da Empresa, e ela precisa saber qual arquivo foi rejeitado. */
export type MyPendingItem = {
  requestId: string;
  periodId: string;
  referenceMonth: string;
  companyId: string;
  companyName: string;
  item: {
    id: string;
    name: string;
    description: string | null;
    acceptedFormats: string[];
    status: 'pending' | 'submitted' | 'accepted' | 'rejected';
    dueDate: string | null;
    rejections: { fileName: string; rejectionReason: string | null }[];
  };
};

export const getMyPending = () => api.get<MyPendingItem[]>('/my/pending');

export const presignMyDocuments = (body: MyPresignBody) =>
  api.post<{
    files: Array<{
      fileName: string;
      accepted: boolean;
      reason?: string;
      documentId?: string;
      uploadUrl?: string;
    }>;
  }>('/my/documents', body);

/* `requestId` também aqui: o `ContactUploadGuard` resolve o escopo do envio pelo corpo,
 * e sem ele o confirm morre em validação depois dos arquivos já terem subido. */
export const confirmMyDocuments = (requestId: string, documentIds: string[]) =>
  api.post<{ refused: Array<{ documentId: string; fileName: string; reason: string }> }>(
    '/my/documents/confirm',
    { requestId, documentIds },
  );

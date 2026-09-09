import { Service, inject } from '@angular/core';
import { Api, apiResource } from '../../core/http/api';

export type RequestDocument = {
  id: string;
  requestItemId: string | null;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  reviewStatus: 'pending' | 'accepted' | 'rejected';
  rejectionReason: string | null;
  uploadedByContactId: string | null;
};

export type RequestItem = {
  id: string;
  name: string;
  description: string | null;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected';
  dueDate: string | null;
  acceptedFormats: string[];
  documents: RequestDocument[];
};

export type RequestDetail = {
  id: string;
  status: 'open' | 'complete' | 'closed';
  closedAt: string | null;
  companyId: string;
  companyName: string;
  periodId: string;
  referenceMonth: string;
  periodDueDate: string | null;
  items: RequestItem[];
  extraDocuments: RequestDocument[];
};

export type UploadLinkResult = {
  uploadUrl: string;
  contactEmail: string;
};

@Service()
export class RequestsService {
  private readonly api = inject(Api);

  request(id: () => string | undefined) {
    return apiResource<RequestDetail>(() => {
      const value = id();
      return value ? `/requests/${value}` : undefined;
    });
  }

  acceptItem(itemId: string) {
    return this.api.post<unknown>(`/request-items/${itemId}/accept`);
  }

  undoAccept(itemId: string) {
    return this.api.post<unknown>(`/request-items/${itemId}/undo-accept`);
  }

  rejectDocument(documentId: string, rejectionReason: string) {
    return this.api.post<unknown>(`/documents/${documentId}/reject`, { rejectionReason });
  }

  reviewExtra(
    documentId: string,
    body: { decision: 'accepted' | 'rejected'; rejectionReason?: string },
  ) {
    return this.api.post<unknown>(`/documents/${documentId}/review-extra`, body);
  }

  /** Revisão em lote: o painel marca as decisões e publica de uma vez — um email só sai
   *  para o Responsável, em vez de um por rejeição. */
  publishReview(
    requestId: string,
    body: {
      acceptItemIds: string[];
      rejectDocuments: { documentId: string; rejectionReason: string }[];
      reviewExtras: {
        documentId: string;
        decision: 'accepted' | 'rejected';
        rejectionReason?: string;
      }[];
    },
  ) {
    return this.api.post<{
      completed: boolean;
      acceptedItems: number;
      rejectedDocuments: number;
      emailSent: boolean;
    }>(`/requests/${requestId}/review`, body);
  }

  /** Copiar e reenviar geram link NOVO: o token é guardado com hash, então o link atual
   *  não pode ser lido de volta — o anterior deixa de valer. */
  uploadLink(id: string) {
    return this.api.post<UploadLinkResult>(`/requests/${id}/upload-link`);
  }

  resendUploadLink(id: string) {
    return this.api.post<UploadLinkResult>(`/requests/${id}/upload-link/resend`);
  }

  closeRequest(id: string) {
    return this.api.post<{ pendingItemCount: number; warning: string | null }>(
      `/requests/${id}/close`,
    );
  }
}

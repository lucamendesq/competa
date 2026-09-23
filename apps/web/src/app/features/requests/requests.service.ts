import { Service, inject } from '@angular/core';
import type {
  RequestDetailResponse,
  RequestDocumentResponse,
  RequestItemResponse,
  UploadLinkResultResponse,
} from '@competa/contracts';
import { Api, apiResource } from '../../core/http/api';

export type RequestDocument = RequestDocumentResponse;
export type RequestItem = RequestItemResponse;
export type RequestDetail = RequestDetailResponse;
export type UploadLinkResult = UploadLinkResultResponse;

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

  documentBlobUrl(documentId: string) {
    return this.api.blobUrl(`/documents/${documentId}/content`);
  }

  downloadDocument(documentId: string, fileName: string) {
    return this.api.download(`/documents/${documentId}/content`, fileName);
  }

  downloadZip(requestId: string, filename: string) {
    return this.api.download(`/requests/${requestId}/zip`, filename);
  }
}

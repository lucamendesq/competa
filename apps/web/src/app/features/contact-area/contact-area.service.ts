import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, apiResource, pageResource } from '../../core/http/api';

export type PendingItem = {
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
    /** Item recusado volta para `pending`: sem as recusas o painel pediria reenvio sem
     *  dizer o quê corrigir (ver shared/item-status.ts). */
    rejections: { fileName: string; rejectionReason: string | null }[];
  };
};

export type PeriodSummary = {
  requestId: string;
  requestStatus: 'open' | 'complete' | 'closed';
  periodId: string;
  referenceMonth: string;
  periodStatus: 'open' | 'closed';
  dueDate: string | null;
  companyId: string;
  companyName: string;
  itemCount: number;
  pendingCount: number;
  deliveredCount: number;
};

export type MyFile = {
  id: string;
  requestItemId: string | null;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  reviewStatus: 'pending' | 'accepted' | 'rejected';
  rejectionReason: string | null;
  uploadedByName: string | null;
};

export type MyPeriodDetail = {
  requestId: string;
  requestStatus: 'open' | 'complete' | 'closed';
  periodId: string;
  referenceMonth: string;
  periodStatus: 'open' | 'closed';
  dueDate: string | null;
  companyId: string;
  companyName: string;
  items: {
    id: string;
    name: string;
    description: string | null;
    acceptedFormats: string[];
    status: 'pending' | 'submitted' | 'accepted' | 'rejected';
    dueDate: string | null;
    documents: MyFile[];
  }[];
  extraDocuments: MyFile[];
};

export type PresignedUploadFile =
  | { fileName: string; accepted: false; reason: string }
  | { fileName: string; accepted: true; documentId: string; uploadUrl: string };

@Service()
export class ContactAreaService {
  private readonly api = inject(Api);
  private readonly http = inject(HttpClient);

  pending() {
    return apiResource<PendingItem[]>(() => '/my/pending');
  }

  periods(params: () => { page: number; perPage: number }) {
    return pageResource<PeriodSummary>(() => '/my/periods', params);
  }

  monthLabel(id: () => string | undefined, companyId?: () => string | undefined) {
    return apiResource<MyPeriodDetail>(() => {
      const value = id();
      if (!value) return undefined;

      const company = companyId?.();
      return company ? `/my/periods/${value}?companyId=${company}` : `/my/periods/${value}`;
    });
  }

  presign(body: {
    requestId: string;
    requestItemId?: string | null;
    files: { fileName: string; contentType: string; sizeBytes: number }[];
  }) {
    return this.api.post<{ files: PresignedUploadFile[] }>('/my/documents', body);
  }

  putFile(uploadUrl: string, file: File) {
    return firstValueFrom(
      this.http.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        responseType: 'text',
      }),
    );
  }

  confirm(requestId: string, documentIds: string[]) {
    return this.api.post<{
      confirmed: number;
      submittedItemIds: string[];
      refused: { documentId: string; fileName: string; reason: string }[];
    }>('/my/documents/confirm', { requestId, documentIds });
  }

  subscribePush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.api.post<{ id: string; endpoint: string }>('/my/push/subscribe', subscription);
  }

  documentBlobUrl(documentId: string) {
    return this.api.blobUrl(`/my/documents/${documentId}/content`);
  }

  downloadDocument(documentId: string, fileName: string) {
    return this.api.download(`/my/documents/${documentId}/content`, fileName);
  }
}

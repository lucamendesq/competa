import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, apiResource } from '../../core/http/api';
import type { PushSubscriptionPayload } from '../../shared/push.service';

export type UploadedFile = {
  fileName: string;
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

@Service()
export class UploadService {
  private readonly api = inject(Api);
  private readonly http = inject(HttpClient);

  checklist(token: () => string) {
    return apiResource<Checklist>(() => `/upload/${token()}`);
  }

  presign(
    token: string,
    body: {
      requestItemId?: string | null;
      files: { fileName: string; contentType: string; sizeBytes: number }[];
    },
  ) {
    return this.api.post<Presign>(`/upload/${token}/documents`, body);
  }

  /** PUT direto no storage: URL absoluta, sem cookie (ver credentials.interceptor). */
  putFile(uploadUrl: string, file: File) {
    return firstValueFrom(
      this.http.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        responseType: 'text',
      }),
    );
  }

  confirm(token: string, documentIds: string[]) {
    return this.api.post<Confirmation>(`/upload/${token}/documents/confirm`, { documentIds });
  }

  subscribePush(token: string, subscription: PushSubscriptionPayload) {
    return this.api.post<{ id: string }>(`/upload/${token}/push`, subscription);
  }

  activateAccess(token: string) {
    return this.api.post<{ email: string; name: string }>(`/upload/${token}/access`, {});
  }
}

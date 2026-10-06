import { api } from '@/api/client';
import type { RequestDetailResponse, ReviewBatchBody } from '@competa/contracts';

export type RequestDetail = RequestDetailResponse;
export type RequestItem = RequestDetailResponse['items'][number];
export type RequestDocument = RequestDetailResponse['items'][number]['documents'][number];

export type ReviewResult = {
  requestId: string;
  requestStatus: 'open' | 'complete' | 'closed';
  completed: boolean;
  acceptedItems: number;
  rejectedDocuments: number;
  linkRotated: boolean;
  emailSent: boolean;
};

export const getRequestDetail = (requestId: string) =>
  api.get<RequestDetail>(`/requests/${requestId}`);

export const publishReview = (requestId: string, body: ReviewBatchBody) =>
  api.post<ReviewResult>(`/requests/${requestId}/review`, body);

export const openDocumentContent = (documentId: string) =>
  api.blobUrl(`/documents/${documentId}/content`);

export const downloadRequestZip = (requestId: string, filename: string) =>
  api.download(`/requests/${requestId}/zip`, filename);

export const resendUploadLink = (requestId: string) =>
  api.post<{ contactEmail: string }>(`/requests/${requestId}/upload-link/resend`);

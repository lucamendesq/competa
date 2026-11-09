import type { ReviewBatchBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { ReviewResult } from '@/features/periods/api/period.types';

export const publishReview = (requestId: string, body: ReviewBatchBody) =>
  api.post<ReviewResult>(`/requests/${requestId}/review`, body);

import type { ReviewBatchBody } from '@competa/contracts';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { addMissingRequests } from '@/features/periods/api/add-missing-requests';
import { closePeriod } from '@/features/periods/api/close-period';
import { closeRequest } from '@/features/periods/api/close-request';
import { downloadPeriodZip, downloadRequestZip } from '@/features/periods/api/download-zips';
import { getUploadLink } from '@/features/periods/api/get-upload-link';
import { openDocument } from '@/features/periods/api/open-document';
import { openPeriod, type OpenPeriodInput } from '@/features/periods/api/open-period';
import { publishReview } from '@/features/periods/api/publish-review';
import { resendUploadLink } from '@/features/periods/api/resend-upload-link';
import { runReminders } from '@/features/periods/api/run-reminders';
import { undoAccept } from '@/features/periods/api/undo-accept';
import { periodKeys, requestKeys } from '@/features/periods/queries/period-keys';

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return (...keys: QueryKey[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
};

export const useOpenPeriod = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: OpenPeriodInput) => openPeriod(input),
    onSuccess: () => invalidate(periodKeys.lists()),
  });
};

export const useAddMissingRequests = (periodId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => addMissingRequests(periodId),
    onSuccess: () => invalidate(periodKeys.lists(), periodKeys.detail(periodId)),
  });
};

export const useClosePeriod = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (periodId: string) => closePeriod(periodId),
    onSuccess: (_result, periodId) => invalidate(periodKeys.lists(), periodKeys.detail(periodId)),
  });
};

export const useRunReminders = (periodId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: runReminders,
    onSuccess: () => invalidate(periodKeys.panel(periodId)),
  });
};

type RequestScope = { requestId: string; periodId: string };

export const usePublishReview = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ requestId, body }: RequestScope & { body: ReviewBatchBody }) =>
      publishReview(requestId, body),
    onSuccess: (_result, { requestId, periodId }) =>
      invalidate(requestKeys.detail(requestId), periodKeys.panel(periodId)),
  });
};

export const useUndoAccept = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ requestItemId }: RequestScope & { requestItemId: string }) =>
      undoAccept(requestItemId),
    onSuccess: (_result, { requestId, periodId }) =>
      invalidate(requestKeys.detail(requestId), periodKeys.panel(periodId)),
  });
};

export const useCloseRequest = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ requestId }: RequestScope) => closeRequest(requestId),
    onSuccess: (_result, { requestId, periodId }) =>
      invalidate(
        requestKeys.detail(requestId),
        periodKeys.panel(periodId),
        periodKeys.detail(periodId),
      ),
  });
};

export const useResendUploadLink = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ requestId }: RequestScope) => resendUploadLink(requestId),
    onSuccess: (_result, { periodId }) => invalidate(periodKeys.panel(periodId)),
  });
};

export const useUploadLink = () =>
  useMutation({ mutationFn: (requestId: string) => getUploadLink(requestId) });

export const useDownloadPeriodZip = () =>
  useMutation({
    mutationFn: ({ periodId, referenceMonth }: { periodId: string; referenceMonth: string }) =>
      downloadPeriodZip(periodId, referenceMonth),
  });

export const useDownloadRequestZip = () =>
  useMutation({
    mutationFn: ({ requestId, filename }: { requestId: string; filename: string }) =>
      downloadRequestZip(requestId, filename),
  });

export const useOpenDocument = () =>
  useMutation({ mutationFn: (documentId: string) => openDocument(documentId) });

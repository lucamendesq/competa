import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyPending } from '@/features/contact-area/api/get-my-pending';
import { getMyPeriod } from '@/features/contact-area/api/get-my-period';
import { getMyPeriods } from '@/features/contact-area/api/get-my-periods';
import {
  confirmMyDocuments,
  downloadMyDocument,
  openMyDocument,
  presignMyDocuments,
} from '@/features/contact-area/api/my-documents';
import { contactKeys } from '@/features/contact-area/queries/contact-keys';
import { putFileToStorage, useUpload, type PresignedFile } from '@/shared/upload';

export const HISTORY_PER_PAGE = 12;

export const useMyPending = () =>
  useQuery({ queryKey: contactKeys.pending(), queryFn: ({ signal }) => getMyPending(signal) });

export const useMyPeriods = (page: number) =>
  useQuery({
    queryKey: contactKeys.periods(page),
    queryFn: ({ signal }) => getMyPeriods(page, HISTORY_PER_PAGE, signal),
    placeholderData: keepPreviousData,
  });

export const useMyPeriod = (selection: { periodId: string; companyId: string } | null) =>
  useQuery({
    queryKey: contactKeys.period(selection?.periodId ?? '', selection?.companyId ?? ''),
    queryFn: ({ signal }) => getMyPeriod(selection!.periodId, selection!.companyId, signal),
    enabled: selection !== null,
  });

export const useOpenMyDocument = () =>
  useMutation({ mutationFn: (documentId: string) => openMyDocument(documentId) });

export const useDownloadMyDocument = () =>
  useMutation({
    mutationFn: ({ documentId, fileName }: { documentId: string; fileName: string }) =>
      downloadMyDocument(documentId, fileName),
  });

type Target = { requestId: string; requestItemId: string | null };

export function useSendMyFiles() {
  const queryClient = useQueryClient();
  const target: Target = { requestId: '', requestItemId: null };
  const upload = useUpload({
    presign: async (files) => {
      const response = await presignMyDocuments({ ...target, files });
      return {
        files: response.files.map((file): PresignedFile =>
          file.accepted && file.documentId && file.uploadUrl
            ? {
                fileName: file.fileName,
                accepted: true,
                documentId: file.documentId,
                uploadUrl: file.uploadUrl,
              }
            : { fileName: file.fileName, accepted: false, reason: file.reason ?? '' },
        ),
      };
    },
    send: putFileToStorage,
    confirm: (documentIds) => confirmMyDocuments(target.requestId, documentIds),
  });

  const sendFiles = async (files: File[], next: Target) => {
    Object.assign(target, next);
    const results = await upload.uploadFiles(files);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: contactKeys.pending() }),
      queryClient.invalidateQueries({ queryKey: contactKeys.periodLists() }),
    ]);
    return results;
  };

  return {
    sendFiles,
    isUploading: upload.isUploading,
    percent: upload.percent,
    results: upload.results,
  };
}

import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { getMyPending, presignMyDocuments, confirmMyDocuments } from '../api';
import { putFileToStorage } from '@/features/upload/api/upload';
import { useUpload } from '@/composables/useUpload';

export function useContactPending() {
  const queryClient = useQueryClient();
  const queryKey = ['my', 'pending'];

  const pendingQuery = useQuery({
    queryKey,
    queryFn: getMyPending,
  });

  let target: { requestId: string; requestItemId: string | null } | null = null;

  const upload = useUpload({
    presign: async (files) => {
      const res = await presignMyDocuments({ ...target!, files });
      return {
        files: (res?.files ?? []).map((f) =>
          f.accepted
            ? {
                fileName: f.fileName,
                accepted: true as const,
                documentId: f.documentId!,
                uploadUrl: f.uploadUrl!,
              }
            : { fileName: f.fileName, accepted: false as const, reason: f.reason! },
        ),
      };
    },
    send: putFileToStorage,
    confirm: async (docIds) => {
      const res = await confirmMyDocuments(target!.requestId, docIds);
      return res ?? { refused: [] };
    },
  });

  const sendFiles = async (files: File[], requestId: string, requestItemId: string | null) => {
    target = { requestId, requestItemId };
    const results = await upload.uploadFiles(files);

    queryClient.invalidateQueries({ queryKey });

    return results;
  };

  return {
    pendingQuery,
    sendFiles,
    uploadPercent: upload.percent,
  };
}

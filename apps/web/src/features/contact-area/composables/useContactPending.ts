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

  const sendFiles = async (files: File[], requestId: string, requestItemId: string | null) => {
    const { uploadFiles } = useUpload({
      presign: async (fs: { fileName: string; contentType: string; sizeBytes: number }[]) => {
        const res = await presignMyDocuments({ requestId, requestItemId, files: fs });
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
      send: (url: string, file: File) => putFileToStorage(url, file),
      confirm: async (docIds: string[]) => {
        const res = await confirmMyDocuments(docIds);
        return res ?? { refused: [] };
      },
    });

    const results = await uploadFiles(files);

    queryClient.invalidateQueries({ queryKey });

    return results;
  };

  return {
    pendingQuery,
    sendFiles,
  };
}

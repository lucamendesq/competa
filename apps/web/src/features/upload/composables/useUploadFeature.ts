import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import {
  getChecklist,
  presignFiles,
  putFileToStorage,
  confirmFiles,
  subscribePush,
  activateAccess,
} from '../api/upload';
import type { PushSubscriptionPayload } from '@/composables/usePush';
import { useUpload } from '@/composables/useUpload';

export function useUploadFeature(token: string) {
  const queryClient = useQueryClient();
  const queryKey = ['checklist', token];

  const checklistQuery = useQuery({
    queryKey,
    queryFn: () => getChecklist(token),
  });

  const subscribePushMutation = useMutation({
    mutationFn: (subscription: PushSubscriptionPayload) => subscribePush(token, subscription),
  });

  const activateAccessMutation = useMutation({
    mutationFn: () => activateAccess(token),
  });

  const sendFiles = async (files: File[], requestItemId: string | null) => {
    const { uploadFiles } = useUpload({
      presign: async (fs: { fileName: string; contentType: string; sizeBytes: number }[]) => {
        const res = await presignFiles(token, { requestItemId, files: fs });
        return res ?? { files: [] };
      },
      send: (url: string, file: File) => putFileToStorage(url, file),
      confirm: async (docIds: string[]) => {
        const res = await confirmFiles(token, docIds);
        return res ?? { refused: [] };
      },
    });

    const results = await uploadFiles(files);

    // reload query
    queryClient.invalidateQueries({ queryKey });

    return results;
  };

  return {
    checklistQuery,
    subscribePushMutation,
    activateAccessMutation,
    sendFiles,
  };
}

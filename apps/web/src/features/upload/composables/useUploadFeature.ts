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
    mutationFn: (body?: { name?: string; password?: string }) => activateAccess(token, body),
  });

  let targetItemId: string | null = null;

  const upload = useUpload({
    presign: async (files) => {
      const res = await presignFiles(token, { requestItemId: targetItemId, files });
      return res ?? { files: [] };
    },
    send: putFileToStorage,
    confirm: async (docIds) => {
      const res = await confirmFiles(token, docIds);
      return res ?? { refused: [] };
    },
  });

  const sendFiles = async (files: File[], requestItemId: string | null) => {
    targetItemId = requestItemId;
    const results = await upload.uploadFiles(files);

    queryClient.invalidateQueries({ queryKey });

    return results;
  };

  return {
    checklistQuery,
    subscribePushMutation,
    activateAccessMutation,
    sendFiles,
    uploadPercent: upload.percent,
  };
}

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
import { ref } from 'vue';

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

  // To wire up the upload composable
  const dropTarget = ref<HTMLElement | null>(null);

  useUpload(dropTarget, {
    presign: async (files) => {
      const res = await presignFiles(token, { files });
      return res ?? { files: [] };
    },
    send: (url, file) => putFileToStorage(url, file),
    confirm: async (docIds) => {
      const res = await confirmFiles(token, docIds);
      return res ?? { refused: [] };
    },
  });

  const sendFiles = async (files: File[], requestItemId: string | null) => {
    // Override presign to include requestItemId
    const tempDeps = {
      presign: async (fs: { fileName: string; contentType: string; sizeBytes: number }[]) => {
        const res = await presignFiles(token, { requestItemId, files: fs });
        return res ?? { files: [] };
      },
      send: (url: string, file: File) => putFileToStorage(url, file),
      confirm: async (docIds: string[]) => {
        const res = await confirmFiles(token, docIds);
        return res ?? { refused: [] };
      },
    };

    // We create a temporary uploader logic or just use the composable's uploadFiles function mapped properly
    // It's cleaner to just call the logic since we already built it generic.

    // But `useUpload` takes `deps` in its constructor. We can just use it directly:
    // Wait, `useUpload` is bound to the `dropTarget` and deps on init.
    // We can just expose `uploadFiles` that takes files and requestItemId.

    const { uploadFiles: runUpload } = useUpload(dropTarget, tempDeps);
    const results = await runUpload(files);

    // reload query
    queryClient.invalidateQueries({ queryKey });

    return results;
  };

  return {
    checklistQuery,
    subscribePushMutation,
    activateAccessMutation,
    sendFiles,
    dropTarget,
  };
}

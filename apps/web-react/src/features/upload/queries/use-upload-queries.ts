import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activateAccess } from '@/features/upload/api/activate-access';
import { confirmFiles } from '@/features/upload/api/confirm-files';
import { getChecklist } from '@/features/upload/api/get-checklist';
import { presignFiles } from '@/features/upload/api/presign-files';
import { putFileToStorage } from '@/features/upload/api/put-file-to-storage';
import { subscribePush } from '@/features/upload/api/subscribe-push';
import { useUpload } from '@/features/upload/hooks/use-upload';
import { uploadKeys } from '@/features/upload/queries/upload-keys';
import type { PushSubscriptionPayload } from '@/shared/pwa';
import { useSession } from '@/shared/session';

export const useUploadChecklist = (token: string) =>
  useQuery({
    queryKey: uploadKeys.checklist(token),
    queryFn: ({ signal }) => getChecklist(token, signal),
  });

export const useSubscribePush = (token: string) =>
  useMutation({
    mutationFn: (subscription: PushSubscriptionPayload) => subscribePush(token, subscription),
  });

export const useActivateAccess = (token: string) => {
  const session = useSession();
  return useMutation({
    mutationFn: (body?: { name?: string }) => activateAccess(token, body),
    onSuccess: () => session.refresh(),
  });
};

export function useSendFiles(token: string) {
  const queryClient = useQueryClient();
  const target = { requestItemId: null as string | null };
  const upload = useUpload({
    presign: (files) => presignFiles(token, { requestItemId: target.requestItemId, files }),
    send: putFileToStorage,
    confirm: (documentIds) => confirmFiles(token, documentIds),
  });

  const sendFiles = async (files: File[], requestItemId: string | null) => {
    target.requestItemId = requestItemId;
    const results = await upload.uploadFiles(files);
    await queryClient.invalidateQueries({ queryKey: uploadKeys.checklist(token) });
    return results;
  };

  return {
    sendFiles,
    isUploading: upload.isUploading,
    percent: upload.percent,
    results: upload.results,
  };
}

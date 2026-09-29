import { ref, type Ref } from 'vue'
import { useDropZone, useFileDialog } from '@vueuse/core'
import { apiErrorMessage } from '@/api/error'

export type FileResult = {
  fileName: string;
  ok: boolean;
  reason?: string;
  retriable?: boolean;
  file?: File;
};

type AuthorizedFile =
  | { fileName: string; accepted: false; reason: string }
  | { fileName: string; accepted: true; documentId: string; uploadUrl: string };

type Dependencies = {
  presign: (
    files: { fileName: string; contentType: string; sizeBytes: number }[],
  ) => Promise<{ files: AuthorizedFile[] }>;
  send: (uploadUrl: string, file: File) => Promise<unknown>;
  confirm: (documentIds: string[]) => Promise<{
    refused: { documentId?: string; fileName: string; reason: string }[];
  }>;
};

export function useUpload(dropTarget: Ref<HTMLElement | null>, deps: Dependencies, options: { accept?: string, multiple?: boolean } = {}) {
  const isUploading = ref(false)
  const progressDone = ref(0)
  const progressTotal = ref(0)
  const results = ref<FileResult[]>([])

  const { isOverDropZone } = useDropZone(dropTarget, {
    onDrop: (files) => {
      if (isUploading.value) return
      if (files?.length) {
        // filter if not multiple
        const toUpload = options.multiple ? files : [files[0]]
        void uploadFiles(toUpload)
      }
    },
  })

  const { open } = useFileDialog({
    accept: options.accept,
    multiple: options.multiple !== false,
  })

  const selectFiles = () => open()

  const uploadFiles = async (files: File[] | FileList) => {
    isUploading.value = true
    const fileArray = Array.from(files)
    progressTotal.value = fileArray.length
    progressDone.value = 0
    results.value = []

    try {
      const authorization = await deps.presign(
        fileArray.map((file) => ({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }))
      )

      const sent: string[] = []
      
      for (let i = 0; i < authorization.files.length; i++) {
        const authorized = authorization.files[i];
        if (!authorized.accepted) {
          results.value.push({ fileName: authorized.fileName, ok: false, reason: authorized.reason });
          progressDone.value += 1;
          continue;
        }

        const file = fileArray[i];
        if (!file) continue;

        try {
          await deps.send(authorized.uploadUrl, file);
          sent.push(authorized.documentId);
        } catch (error) {
          results.value.push({
            fileName: authorized.fileName,
            ok: false,
            reason: apiErrorMessage(error),
            retriable: true,
            file,
          });
        }

        progressDone.value += 1;
      }

      if (sent.length) {
        const confirmation = await deps.confirm(sent);
        const refused = new Map(
          confirmation.refused.map((ref) => [ref.documentId, ref.reason]),
        );

        for (const authorized of authorization.files) {
          if (!authorized.accepted) continue;

          const reason = refused.get(authorized.documentId);
          results.value.push(
            reason
              ? { fileName: authorized.fileName, ok: false, reason: reason }
              : { fileName: authorized.fileName, ok: true },
          );
        }
      }
    } catch (e) {
      results.value.push({
        fileName: 'Falha geral',
        ok: false,
        reason: apiErrorMessage(e)
      })
    } finally {
      isUploading.value = false
    }
    
    return results.value
  }

  return {
    isUploading,
    progressDone,
    progressTotal,
    results,
    isOverDropZone,
    selectFiles,
    uploadFiles
  }
}

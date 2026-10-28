import { ref } from 'vue';
import { apiErrorMessage, failureKind } from '@/api/error';

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

export function useUpload(deps: Dependencies) {
  const isUploading = ref(false);
  const progressDone = ref(0);
  const progressTotal = ref(0);
  const results = ref<FileResult[]>([]);

  const uploadFiles = async (files: File[] | FileList) => {
    isUploading.value = true;
    const fileArray = Array.from(files);
    progressTotal.value = fileArray.length;
    progressDone.value = 0;
    results.value = [];

    try {
      const authorization = await deps.presign(
        fileArray.map((file) => ({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        })),
      );

      const sent: string[] = [];

      for (let i = 0; i < authorization.files.length; i++) {
        const authorized = authorization.files[i];
        if (!authorized.accepted) {
          results.value.push({
            fileName: authorized.fileName,
            ok: false,
            reason: authorized.reason,
          });
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
        const refused = new Map(confirmation.refused.map((ref) => [ref.documentId, ref.reason]));

        /* Só os que subiram: o PUT que falhou já ganhou a linha de erro acima, e listá-lo
         * de novo aqui o mostrava também como enviado. */
        const confirmed = new Set(sent);
        for (const authorized of authorization.files) {
          if (!authorized.accepted || !confirmed.has(authorized.documentId)) continue;

          const reason = refused.get(authorized.documentId);
          results.value.push(
            reason
              ? { fileName: authorized.fileName, ok: false, reason: reason }
              : { fileName: authorized.fileName, ok: true },
          );
        }
      }
    } catch (e) {
      /* Falha no presign/confirm derruba o lote inteiro. A mensagem do servidor fala de
       * campo de API (`requestId`, `storage_key`) e não quer dizer nada para quem está
       * do outro lado — some com ela e devolve os arquivos para nova tentativa. */
      if (import.meta.env?.DEV) console.error('Falha no envio', e);

      const reason =
        failureKind(e) === 'offline'
          ? 'Sem conexão com o servidor. Verifique sua internet.'
          : 'Não foi possível concluir o envio. Tente de novo.';

      results.value = fileArray.map((file) => ({
        fileName: file.name,
        ok: false,
        reason,
        retriable: true,
        file,
      }));
    } finally {
      isUploading.value = false;
    }

    return results.value;
  };

  return {
    isUploading,
    progressDone,
    progressTotal,
    results,
    uploadFiles,
  };
}

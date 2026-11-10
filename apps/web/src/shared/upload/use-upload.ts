import { useReducer } from 'react';
import { apiErrorMessage, failureKind } from '@/shared/lib/api-error';

export type FileToPresign = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type PresignedFile =
  | { fileName: string; accepted: false; reason: string }
  | { fileName: string; accepted: true; documentId: string; uploadUrl: string };

export type FileResult = {
  fileName: string;
  ok: boolean;
  reason?: string;
  retriable?: boolean;
  file?: File;
};

export type UploadDependencies = {
  presign: (files: FileToPresign[]) => Promise<{ files: PresignedFile[] }>;
  send: (
    uploadUrl: string,
    file: File,
    checksumSha256: string,
    onProgress: (loadedBytes: number) => void,
  ) => Promise<unknown>;
  confirm: (
    documentIds: string[],
  ) => Promise<{ refused: { documentId?: string; fileName: string; reason: string }[] }>;
};

type UploadState = {
  isUploading: boolean;
  sentBytes: number;
  totalBytes: number;
  results: FileResult[];
};

type UploadAction =
  | { type: 'start'; totalBytes: number }
  | { type: 'progress'; sentBytes: number }
  | { type: 'done'; results: FileResult[] };

const initialState: UploadState = { isUploading: false, sentBytes: 0, totalBytes: 0, results: [] };

const uploadReducer = (state: UploadState, action: UploadAction): UploadState => {
  switch (action.type) {
    case 'start':
      return { isUploading: true, sentBytes: 0, totalBytes: action.totalBytes, results: [] };
    case 'progress':
      return { ...state, sentBytes: action.sentBytes };
    case 'done':
      return { ...state, isUploading: false, results: action.results };
  }
};

export const percentOf = ({
  sentBytes,
  totalBytes,
}: Pick<UploadState, 'sentBytes' | 'totalBytes'>) =>
  totalBytes ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0;

const sha256Base64 = async (file: File) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return btoa(String.fromCharCode(...digest));
};

export async function runUpload(
  files: File[],
  deps: UploadDependencies,
  onProgress: (sentBytes: number) => void,
): Promise<FileResult[]> {
  const results: FileResult[] = [];
  let sentBytes = 0;
  const report = (value: number) => {
    sentBytes = value;
    onProgress(value);
  };

  try {
    const checksums: string[] = [];
    for (const file of files) checksums.push(await sha256Base64(file));

    const authorization = await deps.presign(
      files.map((file, index) => ({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        checksumSha256: checksums[index] ?? '',
      })),
    );

    const sent: string[] = [];
    for (const [index, authorized] of authorization.files.entries()) {
      const file = files[index];
      if (!authorized.accepted) {
        results.push({ fileName: authorized.fileName, ok: false, reason: authorized.reason });
        report(sentBytes + (file?.size ?? 0));
        continue;
      }
      if (!file) continue;

      const before = sentBytes;
      try {
        await deps.send(authorized.uploadUrl, file, checksums[index] ?? '', (loaded) =>
          report(before + loaded),
        );
        sent.push(authorized.documentId);
      } catch (error) {
        results.push({
          fileName: authorized.fileName,
          ok: false,
          reason: apiErrorMessage(error),
          retriable: true,
          file,
        });
      }
      report(before + file.size);
    }

    if (sent.length) {
      const confirmation = await deps.confirm(sent);
      const refused = new Map(confirmation.refused.map((row) => [row.documentId, row.reason]));
      const confirmed = new Set(sent);
      for (const authorized of authorization.files) {
        if (!authorized.accepted || !confirmed.has(authorized.documentId)) continue;
        const reason = refused.get(authorized.documentId);
        results.push(
          reason
            ? { fileName: authorized.fileName, ok: false, reason }
            : { fileName: authorized.fileName, ok: true },
        );
      }
    }
    return results;
  } catch (error) {
    // Falha no presign/confirm derruba o lote: a mensagem do servidor fala de campo de API e
    // não diz nada a quem envia, então vira uma neutra e os arquivos voltam para nova tentativa.
    const reason =
      failureKind(error) === 'offline'
        ? 'Sem conexão com o servidor. Verifique sua internet.'
        : 'Não foi possível concluir o envio. Tente de novo.';
    return files.map((file) => ({ fileName: file.name, ok: false, reason, retriable: true, file }));
  }
}

export function useUpload(deps: UploadDependencies) {
  const [state, dispatch] = useReducer(uploadReducer, initialState);

  const uploadFiles = async (input: File[] | FileList) => {
    const files = Array.from(input);
    dispatch({ type: 'start', totalBytes: files.reduce((sum, file) => sum + file.size, 0) });
    const results = await runUpload(files, deps, (sentBytes) =>
      dispatch({ type: 'progress', sentBytes }),
    );
    dispatch({ type: 'done', results });
    return results;
  };

  return {
    isUploading: state.isUploading,
    percent: percentOf(state),
    results: state.results,
    uploadFiles,
  };
}

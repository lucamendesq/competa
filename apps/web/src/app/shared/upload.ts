/** `retriable` separa transporte de política: queda de sinal no PUT pode ser tentada de
 *  novo com o MESMO arquivo; formato/tamanho recusados pela API, não — pedir retry ali é
 *  mandar o Responsável repetir o que nunca vai passar. `file` volta junto para a tela não
 *  precisar guardar o `File[]` por conta própria. */
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
    refused: { fileName: string; reason: string }[];
  }>;
  describeError: (error: unknown) => string;
  /** Contagem, não bytes: o roteiro é sequencial, então "3 de 5" é o progresso honesto e
   *  barato. Progresso por byte exigiria `reportProgress` em cada PUT. */
  onProgress?: (done: number, total: number) => void;
};

/** Presign → PUT no storage → confirmação. Os dois fluxos de envio (link público e área
 *  logada) só diferem no guard da API: o roteiro do navegador é o mesmo. */
export const uploadFiles = async (files: File[], deps: Dependencies): Promise<FileResult[]> => {
  const authorization = await deps.presign(
    files.map((file) => ({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    })),
  );

  const results: FileResult[] = [];
  const sent: string[] = [];
  const total = authorization.files.length;
  let done = 0;

  deps.onProgress?.(0, total);

  for (const authorized of authorization.files) {
    if (!authorized.accepted) {
      results.push({ fileName: authorized.fileName, ok: false, reason: authorized.reason });
      deps.onProgress?.((done += 1), total);
      continue;
    }

    const file = files.find((candidate) => candidate.name === authorized.fileName);
    if (!file) continue;

    try {
      await deps.send(authorized.uploadUrl, file);
      sent.push(authorized.documentId);
    } catch (error) {
      results.push({
        fileName: authorized.fileName,
        ok: false,
        reason: deps.describeError(error),
        retriable: true,
        file,
      });
    }

    deps.onProgress?.((done += 1), total);
  }

  if (!sent.length) return results;

  // A palavra final é da confirmação: ela confere no storage o que realmente chegou.
  const confirmation = await deps.confirm(sent);
  const refused = new Map(
    confirmation.refused.map((refused) => [refused.fileName, refused.reason]),
  );

  for (const authorized of authorization.files) {
    if (!authorized.accepted) continue;

    const reason = refused.get(authorized.fileName);
    results.push(
      reason
        ? { fileName: authorized.fileName, ok: false, reason: reason }
        : { fileName: authorized.fileName, ok: true },
    );
  }

  return results;
};

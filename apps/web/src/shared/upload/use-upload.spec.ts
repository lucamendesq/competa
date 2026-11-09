import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PresignedFile } from '@/shared/upload/use-upload';
import { useUpload, type UploadDependencies } from '@/shared/upload/use-upload';
import { ApiError } from '@/shared/lib/api-error';
import { renderHookWithProviders } from '@/testing/test-utils';

const file = (name: string, content = '0123456789') =>
  new File([content], name, { type: 'image/png' });
const SHA256_OF_0123456789 = 'hNiYd/DUBB77a/kaFvAkjy/Vc+avBcGflr7bn4gveII=';

const acceptAll = (files: { fileName: string }[]) => ({
  files: files.map((row, index): PresignedFile => ({
    fileName: row.fileName,
    accepted: true,
    documentId: `doc-${index}`,
    uploadUrl: `https://storage.local/doc-${index}`,
  })),
});

const run = async (deps: UploadDependencies, files: File[]) => {
  const { result } = renderHookWithProviders(() => useUpload(deps));
  let results: Awaited<ReturnType<typeof result.current.uploadFiles>> = [];
  await act(async () => {
    results = await result.current.uploadFiles(files);
  });
  return { results, hook: result };
};

describe('useUpload', () => {
  it('presign 422 devolve todos retriable com mensagem neutra e o arquivo preservado', async () => {
    const { results } = await run(
      {
        presign: () => {
          throw new ApiError(
            422,
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dados inválidos.',
                details: [{ path: [], message: 'Informe a Solicitação (requestId) do envio.' }],
              },
            },
            'API Error 422',
          );
        },
        send: async () => undefined,
        confirm: async () => ({ refused: [] }),
      },
      [file('nota.png'), file('extrato.png')],
    );

    expect(results).toHaveLength(2);
    for (const row of results) {
      expect(row).toMatchObject({
        ok: false,
        retriable: true,
        reason: 'Não foi possível concluir o envio. Tente de novo.',
      });
      expect(row.file).toBeInstanceOf(File);
    }
  });

  it('caminho feliz: presign e PUT levam o mesmo SHA-256 e o confirm recebe os ids', async () => {
    const presigned: { checksumSha256: string }[] = [];
    const sentChecksums: string[] = [];
    const confirmed: string[][] = [];

    const { results, hook } = await run(
      {
        presign: async (files) => {
          presigned.push(...files);
          return acceptAll(files);
        },
        send: async (_url, _file, checksum) => {
          sentChecksums.push(checksum);
        },
        confirm: async (ids) => {
          confirmed.push(ids);
          return { refused: [] };
        },
      },
      [file('balancete.pdf')],
    );

    expect(results).toEqual([{ fileName: 'balancete.pdf', ok: true }]);
    expect(presigned[0]?.checksumSha256).toBe(SHA256_OF_0123456789);
    expect(sentChecksums).toEqual([SHA256_OF_0123456789]);
    expect(confirmed).toEqual([['doc-0']]);
    expect(hook.current.isUploading).toBe(false);
    expect(hook.current.percent).toBe(100);
  });

  it('PUT falha em um arquivo: só ele fica retriable e não aparece como enviado', async () => {
    const confirm = vi.fn(async () => ({ refused: [] }));
    const { results } = await run(
      {
        presign: async (files) => acceptAll(files),
        send: async (url) => {
          if (url.endsWith('doc-1')) throw new TypeError('Failed to fetch');
        },
        confirm,
      },
      [file('a.png'), file('b.png'), file('c.png')],
    );

    expect(confirm).toHaveBeenCalledWith(['doc-0', 'doc-2']);
    expect(results.filter((row) => row.fileName === 'b.png')).toEqual([
      expect.objectContaining({ ok: false, retriable: true }),
    ]);
    expect(results.filter((row) => row.ok).map((row) => row.fileName)).toEqual(['a.png', 'c.png']);
  });

  it('confirm recusa um: ele fica ok false com o motivo do servidor e os outros ok true', async () => {
    const { results } = await run(
      {
        presign: async (files) => acceptAll(files),
        send: async () => undefined,
        confirm: async () => ({
          refused: [{ documentId: 'doc-0', fileName: 'a.png', reason: 'Arquivo vazio.' }],
        }),
      },
      [file('a.png'), file('b.png')],
    );

    expect(results).toEqual([
      { fileName: 'a.png', ok: false, reason: 'Arquivo vazio.' },
      { fileName: 'b.png', ok: true },
    ]);
  });

  it('o progresso soma os recusados no presign e nunca passa de 100', async () => {
    const percents: number[] = [];
    const { result } = renderHookWithProviders(() =>
      useUpload({
        presign: async (files) => ({
          files: [
            { fileName: files[0]!.fileName, accepted: false, reason: 'Formato não aceito.' },
            {
              fileName: files[1]!.fileName,
              accepted: true,
              documentId: 'doc-1',
              uploadUrl: 'https://storage.local/doc-1',
            },
          ],
        }),
        send: async (_url, sent, _checksum, onProgress) => {
          onProgress(sent.size * 2);
        },
        confirm: async () => ({ refused: [] }),
      }),
    );

    await act(async () => {
      const pending = result.current.uploadFiles([file('a.exe'), file('b.png')]);
      percents.push(result.current.percent);
      await pending;
    });
    percents.push(result.current.percent);

    expect(Math.max(...percents)).toBeLessThanOrEqual(100);
    expect(result.current.percent).toBe(100);
    expect(result.current.results[0]).toEqual({
      fileName: 'a.exe',
      ok: false,
      reason: 'Formato não aceito.',
    });
  });

  it('sem conexão no presign avisa que está offline', async () => {
    const { results } = await run(
      {
        presign: () => Promise.reject(new TypeError('Failed to fetch')),
        send: async () => undefined,
        confirm: async () => ({ refused: [] }),
      },
      [file('a.png')],
    );

    expect(results[0]?.reason).toBe('Sem conexão com o servidor. Verifique sua internet.');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { uploadFiles } from './upload';

const file = (nome: string, kind = 'application/pdf') =>
  new File(['conteudo'], nome, { type: kind });

const deps = (overrides: Partial<Parameters<typeof uploadFiles>[1]>) => ({
  presign: vi.fn(),
  send: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue({ refused: [] }),
  describeError: () => 'falhou',
  ...overrides,
});

describe('enviarArquivos', () => {
  it('sobe só o que o presign aceitou e confirma esses documentos', async () => {
    const dependencies = deps({
      presign: vi.fn().mockResolvedValue({
        files: [
          { fileName: 'ok.pdf', accepted: true, documentId: 'doc-1', uploadUrl: 'https://s/1' },
          { fileName: 'ruim.txt', accepted: false, reason: 'Formato .txt não aceito neste item.' },
        ],
      }),
    });

    const results = await uploadFiles([file('ok.pdf'), file('ruim.txt')], dependencies);

    expect(dependencies.send).toHaveBeenCalledTimes(1);
    expect(dependencies.send).toHaveBeenCalledWith('https://s/1', expect.any(File));
    expect(dependencies.confirm).toHaveBeenCalledWith(['doc-1']);
    expect(results).toEqual([
      { fileName: 'ruim.txt', ok: false, reason: 'Formato .txt não aceito neste item.' },
      { fileName: 'ok.pdf', ok: true },
    ]);
  });

  /** A palavra final é da confirmação: o que não chegou ao storage não vale como enviado. */
  it('marca como recusado o que a confirmação rejeitou', async () => {
    const dependencies = deps({
      presign: vi.fn().mockResolvedValue({
        files: [
          { fileName: 'a.pdf', accepted: true, documentId: 'doc-a', uploadUrl: 'https://s/a' },
          { fileName: 'b.pdf', accepted: true, documentId: 'doc-b', uploadUrl: 'https://s/b' },
        ],
      }),
      confirm: vi.fn().mockResolvedValue({
        refused: [{ fileName: 'b.pdf', reason: 'Arquivo não chegou ao storage.' }],
      }),
    });

    const results = await uploadFiles([file('a.pdf'), file('b.pdf')], dependencies);

    expect(results).toEqual([
      { fileName: 'a.pdf', ok: true },
      { fileName: 'b.pdf', ok: false, reason: 'Arquivo não chegou ao storage.' },
    ]);
  });

  it('não confirma nada quando todo PUT falhou', async () => {
    const dependencies = deps({
      presign: vi.fn().mockResolvedValue({
        files: [
          { fileName: 'a.pdf', accepted: true, documentId: 'doc-a', uploadUrl: 'https://s/a' },
        ],
      }),
      send: vi.fn().mockRejectedValue(new Error('rede')),
    });

    const results = await uploadFiles([file('a.pdf')], dependencies);

    expect(dependencies.confirm).not.toHaveBeenCalled();
    // `retriable` + `file`: falha de transporte pode ser tentada de novo com o mesmo
    // arquivo (é o que a tela oferece), diferente de recusa por formato/tamanho.
    expect(results).toMatchObject([
      { fileName: 'a.pdf', ok: false, reason: 'falhou', retriable: true },
    ]);
    expect(results[0].file).toBeInstanceOf(File);
  });
});

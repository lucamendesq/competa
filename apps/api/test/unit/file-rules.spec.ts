import { fileTypeFromBuffer } from 'file-type';
import { describe, expect, it } from 'vitest';
import { isFormatCompatible } from '../../src/modules/requests/file-rules.js';

const accepts = async (fileName: string, content: Buffer) =>
  isFormatCompatible((await fileTypeFromBuffer(content))?.ext, fileName, content);

const nfe = '<nfeProc versao="4.00"><NFe><infNFe Id="NFe35"/></NFe></nfeProc>';

describe('isFormatCompatible para formatos de texto', () => {
  it('aceita XML fiscal com prólogo, com BOM e sem prólogo', async () => {
    expect(await accepts('nota.xml', Buffer.from(`<?xml version="1.0"?>${nfe}`))).toBe(true);
    expect(
      await accepts(
        'nota.xml',
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${nfe}`),
        ]),
      ),
    ).toBe(true);
    expect(await accepts('nota.xml', Buffer.from(nfe))).toBe(true);
  });

  it('recusa XML com byte nulo e binário declarado como XML', async () => {
    expect(await accepts('nota.xml', Buffer.from(`<?xml version="1.0"?>\0${nfe}`))).toBe(false);
    expect(await accepts('nota.xml', Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toBe(false);
  });

  it('CSV e OFX que o sniffer reconhece como XML continuam recusados', async () => {
    const xml = Buffer.from(`<?xml version="1.0"?>${nfe}`);
    expect(await accepts('extrato.csv', xml)).toBe(false);
    expect(await accepts('extrato.ofx', xml)).toBe(false);
    expect(await accepts('extrato.csv', Buffer.from('data;valor\n2026-10-01;10,00\n'))).toBe(true);
  });
});

import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { readSpreadsheet, templateCsv } from '@/features/companies/utils/spreadsheet';

const workbookFile = (name: string) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Empresa', 'CNPJ'],
      ['Padaria', 11222333000181],
    ]),
    'Empresas',
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Outra aba']]), 'Notas');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([bytes], name);
};

describe('readSpreadsheet', () => {
  it('.xlsx de duas abas lê só a primeira, com números crus', async () => {
    const read = await readSpreadsheet(workbookFile('carteira.xlsx'));

    expect(read.name).toBe('carteira.xlsx');
    expect(read.content).toBe('Empresa,CNPJ\nPadaria,11222333000181');
    expect(read.content).not.toContain('Outra aba');
  });

  it('.csv é lido como texto', async () => {
    const read = await readSpreadsheet(new File(['Empresa\nPadaria\n'], 'lista.CSV'));

    expect(read.content).toBe('Empresa\nPadaria\n');
  });

  it('extensão desconhecida pede .csv ou .xlsx', async () => {
    await expect(readSpreadsheet(new File(['x'], 'lista.pdf'))).rejects.toThrow(
      'Envie um arquivo .csv ou .xlsx.',
    );
  });

  it('o modelo tem BOM, separa com ";" e lista as colunas', () => {
    const [header] = templateCsv().split('\n');

    expect(header).toBe(
      '﻿Empresa;CNPJ;Responsável;E-mail do responsável;Telefone;Tem funcionários;Aceita pagamento por cartão;Controla estoque',
    );
  });
});

import { COMPANY_FLAGS } from '@competa/contracts';
import { FLAG_LABEL } from '@/shared/lib/format';

export type ReadSpreadsheet = { name: string; content: string };

export class SpreadsheetError extends Error {}

export const IMPORT_COLUMNS = [
  { header: 'Empresa', key: 'name', required: true },
  { header: 'CNPJ', key: 'cnpj', required: false },
  { header: 'Responsável', key: 'contact_name', required: false },
  { header: 'E-mail do responsável', key: 'contact_email', required: false },
  { header: 'Telefone', key: 'contact_phone', required: false },
  ...COMPANY_FLAGS.map((flag) => ({
    header: FLAG_LABEL[flag] ?? flag,
    key: `flag_${flag}`,
    hint: 'Sim ou Não',
    required: false,
  })),
] as { header: string; key: string; required: boolean; hint?: string }[];

const TEMPLATE_EXAMPLE = [
  'Padaria Pão Quente Ltda',
  '11.222.333/0001-81',
  'Maria Souza',
  'maria@padaria.com.br',
  '(11) 98888-7777',
  'Sim',
  'Não',
  'Não',
];

export const templateCsv = () =>
  `﻿${IMPORT_COLUMNS.map((column) => column.header).join(';')}\n${TEMPLATE_EXAMPLE.join(';')}\n`;

export async function readSpreadsheet(file: File): Promise<ReadSpreadsheet> {
  if (/\.xlsx?$/i.test(file.name)) {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const [firstName] = workbook.SheetNames;
      const firstSheet = firstName ? workbook.Sheets[firstName] : undefined;
      if (!firstSheet) throw new SpreadsheetError('empty');
      return {
        name: file.name,
        content: XLSX.utils.sheet_to_csv(firstSheet, { rawNumbers: true }),
      };
    } catch {
      throw new SpreadsheetError(
        'Não foi possível ler esta planilha. Exporte como CSV e tente de novo.',
      );
    }
  }

  if (!/\.csv$/i.test(file.name)) throw new SpreadsheetError('Envie um arquivo .csv ou .xlsx.');

  return { name: file.name, content: await file.text() };
}

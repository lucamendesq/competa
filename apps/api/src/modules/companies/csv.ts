export type CsvRow = { line: number; cells: string[] };

export const parseCsv = (text: string): CsvRow[] => {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const delimiter = detectDelimiter(text);

  const endField = () => {
    cells.push(field.trim());
    field = '';
  };
  const endRow = () => {
    endField();
    if (cells.some((cell) => cell !== '')) rows.push({ line: rowStart, cells });
    cells = [];
    rowStart = line;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') line++;

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === delimiter) endField();
    else if (char === '\n') endRow();
    else if (char !== '\r') field += char;
  }

  endRow();

  return rows;
};

const detectDelimiter = (text: string) => {
  const breakAt = text.indexOf('\n');
  const header = text.slice(0, breakAt === -1 ? text.length : breakAt);

  return (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
};

/** Cabeçalho em português vira a coluna canônica: o contador exporta a planilha do
 *  sistema dele, com "Razão Social" e "E-mail do responsável" — não `name`/`contact_email`. */
const HEADER_ALIASES: Record<string, string> = {
  razao_social: 'name',
  empresa: 'name',
  nome: 'name',
  nome_da_empresa: 'name',
  cnpj: 'cnpj',
  responsavel: 'contact_name',
  nome_do_responsavel: 'contact_name',
  email: 'contact_email',
  e_mail: 'contact_email',
  email_do_responsavel: 'contact_email',
  e_mail_do_responsavel: 'contact_email',
  telefone: 'contact_phone',
  celular: 'contact_phone',
  whatsapp: 'contact_phone',
  tem_funcionarios: 'flag_has_employees',
  aceita_pagamento_por_cartao: 'flag_accepts_card_payments',
  controla_estoque: 'flag_has_inventory',
};

export const parseCsvRecords = (text: string) => {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];

  const keys = header.cells
    .map((cell) =>
      cell
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, ''),
    )
    .map((key) => HEADER_ALIASES[key] ?? key);

  return rows.map(({ line, cells }) => ({
    line,
    values: Object.fromEntries(keys.map((key, column) => [key, cells[column] ?? ''])),
  }));
};

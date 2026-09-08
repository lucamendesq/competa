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

export const parseCsvRecords = (text: string) => {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];

  const keys = header.cells.map((cell) =>
    cell
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
  );

  return rows.map(({ line, cells }) => ({
    line,
    values: Object.fromEntries(keys.map((key, column) => [key, cells[column] ?? ''])),
  }));
};

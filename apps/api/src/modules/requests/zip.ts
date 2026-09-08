export type ZipDocument = {
  storageKey: string;
  fileName: string;
  itemName: string | null;
  companyName: string;
  reviewStatus: string;
};

export type ZipEntry = { storageKey: string; path: string };

/** Windows e macOS recusam esses caracteres em nome de arquivo, e `/` criaria pasta
 *  fantasma dentro do zip. Caractere de controle vai fora junto. */
const sanitize = (name: string) =>
  name
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120) || 'sem-nome';

const folderFor = (document: ZipDocument, withCompany: boolean) =>
  [
    withCompany ? sanitize(document.companyName) : null,
    document.itemName ? sanitize(document.itemName) : 'Documentos Extra',
  ]
    .filter(Boolean)
    .join('/');

const dedupe = (path: string, used: Set<string>) => {
  if (!used.has(path)) return path;

  const dot = path.lastIndexOf('.');
  const [base, extension] =
    dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];

  let counter = 2;
  let candidate = `${base} (${counter})${extension}`;
  while (used.has(candidate)) candidate = `${base} (${++counter})${extension}`;

  return candidate;
};

export const zipEntries = (documents: ZipDocument[], withCompany: boolean): ZipEntry[] => {
  const used = new Set<string>();

  return documents
    .filter((document) => document.reviewStatus !== 'rejected')
    .map((document) => {
      const path = dedupe(
        `${folderFor(document, withCompany)}/${sanitize(document.fileName)}`,
        used,
      );
      used.add(path);

      return { storageKey: document.storageKey, path };
    });
};

export const zipFileName = (label: string, referenceMonth: string) =>
  `${label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${referenceMonth.slice(0, 7)}.zip`;

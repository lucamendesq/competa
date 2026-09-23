// ponytail: `sizeBytes` é o que o cliente declara — a URL pré-assinada não assina
// Content-Length, então um arquivo maior passaria pelo storage. Assinar Content-Length
// (ou conferir com HeadObject na confirmação) quando isso virar problema real.
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 500;
/* Teto por Solicitação (AVAIL-2): o link vive 30 dias e sem teto o acúmulo vira zip
 * imontável e fatura de storage sem dono. ≥ MAX_FILES_PER_UPLOAD: um lote único cheio
 * ainda cabe. */
export const MAX_DOCS_PER_REQUEST = 1000;
export const MAX_BYTES_PER_REQUEST = 500 * 1024 * 1024;

export const requestCapRefusal = (usage: { count: number; bytes: number }, file: UploadedFile) => {
  if (usage.count >= MAX_DOCS_PER_REQUEST) {
    return `Esta solicitação já tem ${MAX_DOCS_PER_REQUEST} documentos — o limite. Fale com a contabilidade.`;
  }

  if (usage.bytes + file.sizeBytes > MAX_BYTES_PER_REQUEST) {
    return `Esta solicitação chegou ao limite de ${megabytes(MAX_BYTES_PER_REQUEST)} MB no total. Fale com a contabilidade.`;
  }

  return null;
};

/* `Object.create(null)`: com um objeto literal, `'constructor' in mapa` é true e
 * `mapa['constructor']` devolve uma função — um content-type inventado passaria pela
 * allowlist e entraria no nome do arquivo no storage. */
export const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/xml': 'xml',
    'text/xml': 'xml',
    'text/csv': 'csv',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/x-ofx': 'ofx',
    'application/ofx': 'ofx',
    'text/ofx': 'ofx',
  },
);

export const DEFAULT_EXTRA_ACCEPTED_FORMATS = [
  'pdf',
  'xml',
  'zip',
  'csv',
  'xlsx',
  'xls',
  'ofx',
  'jpg',
  'jpeg',
  'png',
] as const;

export type UploadedFile = { fileName: string; contentType: string; sizeBytes: number };

export const fileExtension = ({ fileName, contentType }: Omit<UploadedFile, 'sizeBytes'>) => {
  const fromFileName = /\.([a-z0-9]{1,8})$/.exec(fileName.toLowerCase())?.[1];
  if (fromFileName) return fromFileName;

  return EXTENSION_BY_CONTENT_TYPE[contentType.split(';')[0].trim().toLowerCase()];
};

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

export const rejectionReason = (file: UploadedFile, acceptedFormats: readonly string[] | null) => {
  if (!file.fileName || !file.fileName.trim()) {
    return 'Nome do arquivo não pode ser vazio.';
  }

  if (file.sizeBytes <= 0) {
    return 'Arquivo vazio (0 bytes).';
  }

  if (file.fileName.length > 255) {
    return 'Nome do arquivo excede o limite de 255 caracteres.';
  }

  if (file.sizeBytes > MAX_FILE_BYTES) {
    return `Arquivo de ${megabytes(file.sizeBytes)} MB acima do limite de ${megabytes(MAX_FILE_BYTES)} MB por arquivo.`;
  }

  const formats = acceptedFormats ?? DEFAULT_EXTRA_ACCEPTED_FORMATS;

  const extension = fileExtension(file);
  if (!extension) return 'Não foi possível identificar o formato do arquivo.';

  if (!formats.includes(extension)) {
    return acceptedFormats
      ? `Formato .${extension} não aceito neste item (aceitos: ${acceptedFormats.join(', ')}).`
      : `Formato .${extension} não aceito para documento extra (aceitos: ${DEFAULT_EXTRA_ACCEPTED_FORMATS.join(', ')}).`;
  }

  return null;
};

export const buildStorageKey = (input: {
  accountingFirmId: string;
  referenceMonth: string;
  requestId: string;
  documentId: string;
  file: Omit<UploadedFile, 'sizeBytes'>;
}) => {
  const extension = fileExtension(input.file);
  const suffix = extension ? `.${extension}` : '';

  // Nome de arquivo do Responsável nunca entra no caminho (path traversal / colisão).
  return `firm/${input.accountingFirmId}/period/${input.referenceMonth}/request/${input.requestId}/${input.documentId}${suffix}`;
};

export const confirmationRefusal = (input: {
  fileName: string;
  declaredBytes: number;
  realBytes: number | undefined;
}) => {
  if (input.realBytes === undefined) return 'Arquivo não chegou ao storage.';
  if (input.realBytes > MAX_FILE_BYTES) {
    return `Arquivo de ${Math.round(input.realBytes / 1024 / 1024)} MB acima do limite de ${MAX_FILE_BYTES / 1024 / 1024} MB por arquivo.`;
  }
  if (input.realBytes !== input.declaredBytes) {
    return `O arquivo enviado (${input.realBytes} bytes) não tem o tamanho declarado (${input.declaredBytes} bytes).`;
  }

  return null;
};

/** Só estes o navegador pode renderizar na própria aba. PDF e imagem são inertes; qualquer
 *  outro (HTML à frente de todos) vira `attachment`. */
const INLINE_CONTENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

/** O `content_type` guardado é o que o Responsável DECLAROU no presign — ninguém verifica
 *  o conteúdo, e `text/html` com script executaria na origem da API, onde vive o cookie de
 *  sessão do Contador (e, via `blob:`, na origem do front). Por isso o que sai na resposta
 *  nunca é o valor cru: fora da allowlist vira `application/octet-stream`, e `inline` só
 *  para os três formatos que o painel realmente pré-visualiza. */
export const servedContentType = (declared: string) => {
  const normalized = declared.split(';')[0].trim().toLowerCase();
  const allowed = normalized in EXTENSION_BY_CONTENT_TYPE;

  return {
    contentType: allowed ? normalized : 'application/octet-stream',
    inline: allowed && INLINE_CONTENT_TYPES.has(normalized),
  };
};

export const validateMagicBytes = (header: Buffer, extension: string): string | null => {
  if (header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a) {
    return 'Arquivo executável (PE/MZ) não é permitido.';
  }

  if (
    header.length >= 4 &&
    header[0] === 0x7f &&
    header[1] === 0x45 &&
    header[2] === 0x4c &&
    header[3] === 0x46
  ) {
    return 'Arquivo executável (ELF) não é permitido.';
  }

  const ext = extension.toLowerCase();

  if (ext === 'pdf') {
    if (header.length < 4 || header.toString('ascii', 0, 4) !== '%PDF') {
      return 'Conteúdo do arquivo não corresponde a um documento PDF válido.';
    }
  }

  if (ext === 'png') {
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (header.length < 8 || !pngMagic.every((byte, idx) => header[idx] === byte)) {
      return 'Conteúdo do arquivo não corresponde a uma imagem PNG válida.';
    }
  }

  if (ext === 'jpg' || ext === 'jpeg') {
    if (header.length < 3 || header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
      return 'Conteúdo do arquivo não corresponde a uma imagem JPEG válida.';
    }
  }

  if (ext === 'zip' || ext === 'xlsx') {
    if (header.length < 2 || header[0] !== 0x50 || header[1] !== 0x4b) {
      return 'Conteúdo do arquivo não corresponde a um arquivo compactado ou planilha válida.';
    }
  }

  return null;
};

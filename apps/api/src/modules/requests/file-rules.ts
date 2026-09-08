// ponytail: `sizeBytes` é o que o cliente declara — a URL pré-assinada não assina
// Content-Length, então um arquivo maior passaria pelo storage. Assinar Content-Length
// (ou conferir com HeadObject na confirmação) quando isso virar problema real.
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 500;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
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
};

export type UploadedFile = { fileName: string; contentType: string; sizeBytes: number };

export const fileExtension = ({ fileName, contentType }: Omit<UploadedFile, 'sizeBytes'>) => {
  const fromFileName = /\.([a-z0-9]{1,8})$/.exec(fileName.toLowerCase())?.[1];
  if (fromFileName) return fromFileName;

  return EXTENSION_BY_CONTENT_TYPE[contentType.split(';')[0].trim().toLowerCase()];
};

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

export const rejectionReason = (file: UploadedFile, acceptedFormats: readonly string[] | null) => {
  if (file.sizeBytes > MAX_FILE_BYTES) {
    return `Arquivo de ${megabytes(file.sizeBytes)} MB acima do limite de ${megabytes(MAX_FILE_BYTES)} MB por arquivo.`;
  }

  if (!acceptedFormats) return null;

  const extension = fileExtension(file);
  if (!extension) return 'Não foi possível identificar o formato do arquivo.';

  if (!acceptedFormats.includes(extension)) {
    return `Formato .${extension} não aceito neste item (aceitos: ${acceptedFormats.join(', ')}).`;
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

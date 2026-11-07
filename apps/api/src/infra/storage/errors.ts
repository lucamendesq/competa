import { AppError } from '../../lib/app-error.js';

export class ChecksumMismatch extends AppError {
  readonly _tag = 'ChecksumMismatch';
  readonly code = 'CHECKSUM_MISMATCH';
  readonly status = 400;

  constructor() {
    super('O conteúdo enviado não confere com o SHA-256 declarado.');
  }
}

export class PayloadTooLarge extends AppError {
  readonly _tag = 'PayloadTooLarge';
  readonly code = 'PAYLOAD_TOO_LARGE';
  readonly status = 413;

  constructor(declaredBytes: number) {
    const declared =
      declaredBytes >= 1024 * 1024
        ? `${Math.round(declaredBytes / 1024 / 1024)} MB`
        : `${declaredBytes} bytes`;

    super(`O arquivo enviado é maior do que os ${declared} declarados.`);
  }
}

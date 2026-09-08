import { AppError } from '../../lib/app-error.js';

export class PayloadTooLarge extends AppError {
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

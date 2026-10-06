import { AppError } from '../../lib/app-error.js';

export class InvalidTransition extends AppError {
  readonly code = 'INVALID_TRANSITION';
  readonly status = 409;
}

export class ZipAlreadyInFlight extends AppError {
  readonly code = 'ZIP_ALREADY_IN_FLIGHT';
  readonly status = 409;

  constructor() {
    super('Já existe um download deste pacote em andamento. Aguarde ele terminar.');
  }
}

export class ZipTooLarge extends AppError {
  readonly code = 'ZIP_TOO_LARGE';
  readonly status = 422;

  constructor(count: number, max: number) {
    super(
      `Esta competência tem ${count} documentos e o pacote único vai até ${max}. Baixe por Empresa.`,
    );
  }
}

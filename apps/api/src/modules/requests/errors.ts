import { AppError } from '../../lib/app-error.js';

export class InvalidTransition extends AppError {
  readonly _tag = 'InvalidTransition';
  readonly code = 'INVALID_TRANSITION';
  readonly status = 409;
}

export class DeadlineScanInFlight extends AppError {
  readonly _tag = 'DeadlineScanInFlight';
  readonly code = 'DEADLINE_SCAN_IN_FLIGHT';
  readonly status = 409;

  constructor() {
    super('A cobrança dos atrasados já está em andamento. Aguarde ela terminar.');
  }
}

export class ZipAlreadyInFlight extends AppError {
  readonly _tag = 'ZipAlreadyInFlight';
  readonly code = 'ZIP_ALREADY_IN_FLIGHT';
  readonly status = 409;

  constructor() {
    super('Já existe um download deste pacote em andamento. Aguarde ele terminar.');
  }
}

export class ZipTooLarge extends AppError {
  readonly _tag = 'ZipTooLarge';
  readonly code = 'ZIP_TOO_LARGE';
  readonly status = 422;

  constructor(count: number, max: number) {
    super(
      `Esta competência tem ${count} documentos e o pacote único vai até ${max}. Baixe por Empresa.`,
    );
  }
}

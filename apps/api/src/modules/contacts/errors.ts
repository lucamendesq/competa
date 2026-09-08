import { AppError } from '../../lib/app-error.js';

export class AccessAlreadyExists extends AppError {
  readonly code = 'CONTACT_ACCESS_ALREADY_EXISTS';
  readonly status = 409;

  constructor() {
    super('Este Responsável já tem acesso: entre pelo aplicativo ou peça um link de entrada.');
  }
}

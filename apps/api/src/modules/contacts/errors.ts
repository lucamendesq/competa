import { AppError } from '../../lib/app-error.js';

export class AccessAlreadyExists extends AppError {
  readonly _tag = 'AccessAlreadyExists';
  readonly code = 'CONTACT_ACCESS_ALREADY_EXISTS';
  readonly status = 409;

  constructor() {
    super('Este Responsável já tem acesso: entre pelo aplicativo ou peça um link de entrada.');
  }
}

export class PasswordAlreadySet extends AppError {
  readonly _tag = 'PasswordAlreadySet';
  readonly code = 'PASSWORD_ALREADY_SET';
  readonly status = 400;

  constructor() {
    super('Você já tem uma senha cadastrada. Entre com ela ou pelo link enviado ao seu e-mail.');
  }
}

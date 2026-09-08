import { AppError } from '../../lib/app-error.js';

export class InvalidTransition extends AppError {
  readonly code = 'INVALID_TRANSITION';
  readonly status = 409;
}

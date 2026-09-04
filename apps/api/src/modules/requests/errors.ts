import { AppError } from '../../lib/app-error.js';

/** Transição de estado inválida na revisão/encerramento (Item, Documento ou Solicitação):
 *  erro de negócio em PT-BR, nunca 500 nem update silencioso. */
export class InvalidTransition extends AppError {
  readonly code = 'INVALID_TRANSITION';
  readonly status = 409;
}

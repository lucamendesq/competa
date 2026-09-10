export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly status = 422;
}

export class NotFound extends AppError {
  readonly code = 'NOT_FOUND';
  readonly status = 404;

  constructor(message = 'Recurso não encontrado.') {
    super(message);
  }
}

export class Unauthenticated extends AppError {
  readonly code = 'UNAUTHENTICATED';
  readonly status = 401;

  constructor(message = 'Sessão inválida ou expirada.') {
    super(message);
  }
}

export class Forbidden extends AppError {
  readonly code = 'FORBIDDEN';
  readonly status = 403;

  constructor(message = 'Você não tem permissão para acessar isso.') {
    super(message);
  }
}

/** Dependência fora do ar (banco, hoje). 503 e não 500: o orquestrador tira a instância
 *  do balanceador em vez de tratar como bug da aplicação. */
export class ServiceUnavailable extends AppError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly status = 503;
}

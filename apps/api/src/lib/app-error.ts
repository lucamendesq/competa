/** Erro de negócio. Viaja como valor dentro de Result e só vira HTTP no
 *  AppErrorFilter. `message` é PT-BR e exibível ao usuário final. */
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

/** Também usado quando o recurso é de outro tenant — nunca revelar a diferença. */
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

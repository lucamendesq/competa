import { Data, Predicate } from 'effect';

const AppErrorTypeId = Symbol.for('competa/api/AppError');

/** Erro de domínio com `_tag` (`catchTag`, `yield* new X()`) e o `code`/`status` que o mapa de
 *  erros traduz para o corpo HTTP. */
export abstract class AppError extends Data.Error<{
  readonly message: string;
  readonly details?: unknown;
}> {
  readonly [AppErrorTypeId] = AppErrorTypeId;
  abstract readonly _tag: string;
  abstract readonly code: string;
  abstract readonly status: number;

  constructor(message: string, details?: unknown) {
    super(details === undefined ? { message } : { message, details });
    this.name = new.target.name;
  }
}

export const isAppError = (value: unknown): value is AppError =>
  Predicate.hasProperty(value, AppErrorTypeId);

export class ValidationError extends AppError {
  readonly _tag = 'ValidationError';
  readonly code = 'VALIDATION_ERROR';
  readonly status = 422;
}

/** Corpo que o parser recusa antes de qualquer schema — o que o `express.json()` devolvia
 *  como 400. Separado do 422: ali o corpo é legível e o campo é que está errado. */
export class BadRequest extends AppError {
  readonly _tag = 'BadRequest';
  readonly code = 'BAD_REQUEST';
  readonly status = 400;

  constructor(message = 'Corpo inválido.') {
    super(message);
  }
}

export class NotFound extends AppError {
  readonly _tag = 'NotFound';
  readonly code = 'NOT_FOUND';
  readonly status = 404;

  constructor(message = 'Recurso não encontrado.') {
    super(message);
  }
}

export class Unauthenticated extends AppError {
  readonly _tag = 'Unauthenticated';
  readonly code = 'UNAUTHENTICATED';
  readonly status = 401;

  constructor(message = 'Sessão inválida ou expirada.') {
    super(message);
  }
}

export class Forbidden extends AppError {
  readonly _tag = 'Forbidden';
  readonly code = 'FORBIDDEN';
  readonly status = 403;

  constructor(message = 'Você não tem permissão para acessar isso.') {
    super(message);
  }
}

export class PaymentRequired extends AppError {
  readonly _tag = 'PaymentRequired';
  readonly code = 'PAYMENT_REQUIRED';
  readonly status = 402;

  constructor(message = 'Assinatura inativa. Regularize para continuar.') {
    super(message);
  }
}

/** Dependência fora do ar (banco, hoje). 503 e não 500: o orquestrador tira a instância
 *  do balanceador em vez de tratar como bug da aplicação. */
export class ServiceUnavailable extends AppError {
  readonly _tag = 'ServiceUnavailable';
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly status = 503;
}

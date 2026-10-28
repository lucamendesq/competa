import { Cause, Schema } from 'effect';

export class DbError extends Schema.TaggedError<DbError>()('DbError', {
  cause: Schema.Defect(),
}) {}

/** `DbError` é desembrulhado para o erro cru do driver: o mapa de erros e os logs veem
 *  exatamente o que viam antes da migração. */
export const squashError = (cause: Cause.Cause<unknown>): unknown => {
  const error = Cause.squash(cause);

  return error instanceof DbError ? error.cause : error;
};

export type Result<S, F> = Success<S> | Failure<F>;

export type PromiseResult<S, F> = Promise<Success<S> | Failure<F>>;

export interface Success<S> {
  readonly _tag: 'Success';
  readonly value: S;
}

export interface Failure<F> {
  readonly _tag: 'Failure';
  readonly error: F;
}

export const success = <S, F = never>(value: S): Result<S, F> => ({
  _tag: 'Success',
  value,
});

export const failure = <F, S = never>(error: F): Result<S, F> => ({
  _tag: 'Failure',
  error,
});

export const isSuccess = <S, F>(r: Result<S, F>): r is Success<S> => r._tag === 'Success';

export const isFailure = <S, F>(r: Result<S, F>): r is Failure<F> => r._tag === 'Failure';

export const tryCatch = <S, F = unknown>(
  fn: () => S,
  onError: (e: unknown) => F = (e) => e as F,
): Result<S, F> => {
  try {
    return success(fn());
  } catch (e) {
    return failure(onError(e));
  }
};

export const tryCatchAsync = async <S, F = unknown>(
  fn: () => Promise<S>,
  onError: (e: unknown) => F = (e) => e as F,
): Promise<Result<S, F>> => {
  try {
    return success(await fn());
  } catch (e) {
    return failure(onError(e));
  }
};

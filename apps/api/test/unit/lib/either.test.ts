import { expect, test } from 'vitest';
import {
  failure,
  isFailure,
  isSuccess,
  success,
  tryCatch,
  tryCatchAsync,
} from '../../../src/lib/either.js';

test('success carrega o valor e é reconhecido só como sucesso', () => {
  const result = success(42);

  expect(isSuccess(result)).toBe(true);
  expect(isFailure(result)).toBe(false);
  if (!isSuccess(result)) throw new Error('inalcançável');
  expect(result.value).toBe(42);
});

test('failure carrega o erro e é reconhecido só como falha', () => {
  const result = failure('deu ruim');

  expect(isFailure(result)).toBe(true);
  expect(isSuccess(result)).toBe(false);
  if (!isFailure(result)) throw new Error('inalcançável');
  expect(result.error).toBe('deu ruim');
});

test('tryCatch converte exceção em failure em vez de propagar', () => {
  const boom = new Error('explodiu');

  expect(tryCatch(() => 1)).toEqual(success(1));
  expect(
    tryCatch(() => {
      throw boom;
    }),
  ).toEqual(failure(boom));
});

test('tryCatch aceita mapear o erro', () => {
  const result = tryCatch(
    () => {
      throw new Error('explodiu');
    },
    (e) => (e as Error).message,
  );

  expect(result).toEqual(failure('explodiu'));
});

test('tryCatch captura throw de valor que não é Error', () => {
  const result = tryCatch(() => {
    throw 'string crua';
  });

  expect(result).toEqual(failure('string crua'));
});

test('tryCatchAsync captura rejeição da promise', async () => {
  const boom = new Error('explodiu async');

  await expect(tryCatchAsync(async () => 7)).resolves.toEqual(success(7));
  await expect(
    tryCatchAsync(async () => {
      throw boom;
    }),
  ).resolves.toEqual(failure(boom));
  await expect(
    tryCatchAsync(async () => {
      throw 42;
    }),
  ).resolves.toEqual(failure(42));
});

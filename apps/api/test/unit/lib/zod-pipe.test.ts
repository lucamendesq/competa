import { expect, test } from 'vitest';
import * as z from 'zod';
import { ValidationError } from '../../../src/lib/app-error.js';
import { zodPipe } from '../../../src/lib/zod-pipe.js';

const schema = z.object({
  name: z.string().min(3),
  age: z.coerce.number().int().optional(),
});

const pipe = zodPipe(schema);

test('chave desconhecida é removida — nada de campo extra chegando ao repositório', () => {
  const value = pipe.transform({ name: 'Padaria', vemDoCliente: 'ignore-me' }, {} as never);

  expect(value).toEqual({ name: 'Padaria' });
  expect(value).not.toHaveProperty('vemDoCliente');
});

test('dado inválido vira ValidationError 422 com fieldErrors por campo', () => {
  try {
    pipe.transform({ name: 'ab', age: 'nao-e-numero' }, {} as never);
    throw new Error('deveria ter lançado');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    const failure = error as ValidationError;
    expect(failure.status).toBe(422);
    expect(failure.code).toBe('VALIDATION_ERROR');
    const details = failure.details as { fieldErrors: Record<string, string[]> };
    expect(Object.keys(details.fieldErrors).sort()).toEqual(['age', 'name']);
    expect(details.fieldErrors.name).toHaveLength(1);
  }
});

test('a mensagem do erro de validação é em PT-BR', () => {
  expect(() => pipe.transform({ name: 'ab' }, {} as never)).toThrow('Dados inválidos.');
});

test('valor válido passa transformado pelo schema (coerção incluída)', () => {
  expect(pipe.transform({ name: 'Padaria', age: '30' }, {} as never)).toEqual({
    name: 'Padaria',
    age: 30,
  });
});

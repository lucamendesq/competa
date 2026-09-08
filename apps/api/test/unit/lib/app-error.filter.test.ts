import { Logger, HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { beforeEach, expect, test, vi } from 'vitest';
import { AppError, Forbidden, NotFound, ValidationError } from '../../../src/lib/app-error.js';
import { AppErrorFilter } from '../../../src/lib/app-error.filter.js';

/** O filtro é o contrato de erro da API: `{ error: { code, message, details? } }` com o
 *  status da classe, e NADA de interno no 500. */
const fakeHost = () => {
  const captured = { status: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };

  return {
    captured,
    host: { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost,
  };
};

const filter = new AppErrorFilter();

const handle = (exception: unknown) => {
  const { captured, host } = fakeHost();
  filter.catch(exception, host);

  return captured as {
    status: number;
    body: { error: { code: string; message: string; details?: unknown } };
  };
};

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

test('AppError vira { error: { code, message } } com o status da própria classe', () => {
  expect(handle(new NotFound())).toMatchObject({
    status: 404,
    body: { error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } },
  });
  expect(handle(new Forbidden())).toMatchObject({
    status: 403,
    body: { error: { code: 'FORBIDDEN' } },
  });
});

test('details só aparece quando o erro trouxe details', () => {
  const withDetail = handle(
    new ValidationError('Dados inválidos.', { fieldErrors: { name: ['curto'] } }),
  );
  expect(withDetail.status).toBe(422);
  expect(withDetail.body.error.details).toEqual({ fieldErrors: { name: ['curto'] } });

  expect(handle(new ValidationError('Dados inválidos.')).body.error).not.toHaveProperty('details');
});

test('HttpException 404 (rota inexistente) responde com code NOT_FOUND', () => {
  const response = handle(new NotFoundException('Cannot GET /rota-que-nao-existe'));

  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe('NOT_FOUND');
  expect(response.body.error.message).toBe('Recurso não encontrado.');
});

test('ThrottlerException é 429 TOO_MANY_REQUESTS, nunca 500', () => {
  const response = handle(new ThrottlerException());

  expect(response.status).toBe(429);
  expect(response.body.error.code).toBe('TOO_MANY_REQUESTS');
});

test('erro desconhecido é 500 INTERNAL_ERROR e não vaza mensagem nem stack interna', () => {
  const interno = new Error(
    'conexão falhou: postgres://usuario:senha-secreta@10.0.0.7/contabilidade',
  );
  const response = handle(interno);

  expect(response.status).toBe(500);
  expect(response.body.error).toEqual({
    code: 'INTERNAL_ERROR',
    message: 'Erro interno. Tente novamente.',
  });

  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toContain('senha-secreta');
  expect(serialized).not.toContain('postgres://');
  expect(serialized).not.toContain('app-error.filter');
});

test('HttpException que não é 404 também não vaza corpo interno (cai no 500)', () => {
  const response = handle(new HttpException('detalhe interno do provedor', 502));

  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toContain('detalhe interno');
});

test('subclasse de AppError sem details mantém apenas code e message', () => {
  class Estranho extends AppError {
    readonly code = 'ESTRANHO';
    readonly status = 418;
  }

  expect(handle(new Estranho('Sou um bule.'))).toMatchObject({
    status: 418,
    body: { error: { code: 'ESTRANHO', message: 'Sou um bule.' } },
  });
});

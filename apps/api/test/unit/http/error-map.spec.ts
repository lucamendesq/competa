import { APIError } from 'better-auth/api';
import { HttpServerError } from 'effect/http';
import * as z from 'zod';
import { describe, expect, it } from 'vitest';
import { describeError, mapError } from '../../../src/http/error-map.js';
import { TooManyRequests } from '../../../src/http/throttle.js';
import {
  Forbidden,
  NotFound,
  ServiceUnavailable,
  Unauthenticated,
  ValidationError,
} from '../../../src/lib/app-error.js';

const anyRequest = {
  method: 'GET',
  url: '/qualquer',
} as HttpServerError.RequestParseError['request'];

describe('mapError — subclasses de AppError', () => {
  it('usa status, code e message da própria classe', () => {
    expect(mapError(new NotFound())).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
    });
    expect(mapError(new Unauthenticated()).status).toBe(401);
    expect(mapError(new ServiceUnavailable('Banco indisponível.'))).toEqual({
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE', message: 'Banco indisponível.' },
    });
  });

  it('inclui details só quando existem', () => {
    const issues = [{ path: ['name'], message: 'obrigatório' }];

    expect(mapError(new ValidationError('Dados inválidos.', issues)).body.details).toEqual(issues);
    expect('details' in mapError(new NotFound()).body).toBe(false);
  });

  it('403 pede registro da negação com o código do erro', () => {
    expect(mapError(new Forbidden()).denial).toBe('FORBIDDEN');
    expect(mapError(new NotFound()).denial).toBeUndefined();
  });

  it('429 do throttler sai com o mesmo corpo do ThrottlerException', () => {
    expect(mapError(new TooManyRequests(10))).toEqual({
      status: 429,
      body: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.',
      },
    });
  });
});

describe('mapError — APIError do better-auth', () => {
  it('abaixo de 500 usa code e message do corpo', () => {
    const error = new APIError('BAD_REQUEST', { code: 'INVALID_EMAIL', message: 'Email ruim.' });

    expect(mapError(error)).toEqual({
      status: 400,
      body: { code: 'INVALID_EMAIL', message: 'Email ruim.' },
    });
  });

  it('sem corpo cai nos defaults de autenticação', () => {
    expect(mapError(new APIError('UNAUTHORIZED')).body).toEqual({
      code: 'AUTH_ERROR',
      message: 'Erro de autenticação.',
    });
  });

  it('403 registra negação', () => {
    expect(mapError(new APIError('FORBIDDEN', { code: 'NO_ACCESS' })).denial).toBe('NO_ACCESS');
  });

  it('5xx cai no fallback interno', () => {
    const mapped = mapError(new APIError('INTERNAL_SERVER_ERROR', { message: 'boom' }));

    expect(mapped.status).toBe(500);
    expect(mapped.internal).toBe(true);
  });
});

describe('mapError — erros do servidor HTTP', () => {
  it('RouteNotFound vira 404, cru ou embrulhado em HttpServerError', () => {
    const notFound = new HttpServerError.RouteNotFound({ request: anyRequest });
    const expected = {
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
    };

    expect(mapError(notFound)).toEqual(expected);
    expect(mapError(new HttpServerError.HttpServerError({ reason: notFound }))).toEqual(expected);
  });

  it('corpo acima do limite vira 413', () => {
    const tooLarge = new HttpServerError.RequestParseError({
      request: anyRequest,
      reason: 'BodyTooLarge',
    });

    expect(mapError(tooLarge)).toEqual({
      status: 413,
      body: { code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' },
    });
  });

  it('corpo inválido vira 400 com a descrição do parser', () => {
    const parse = new HttpServerError.RequestParseError({
      request: anyRequest,
      reason: 'Parse',
      description: 'Unexpected token',
    });

    expect(mapError(parse)).toEqual({
      status: 400,
      body: { code: 'BAD_REQUEST', message: 'Unexpected token' },
    });
    expect(
      mapError(new HttpServerError.RequestParseError({ request: anyRequest, reason: 'Parse' })).body
        .message,
    ).toBe('Corpo inválido.');
  });
});

describe('mapError — fallback 500', () => {
  it('ZodError NÃO tem ramo próprio: continua 500 (bug congelado #1)', () => {
    const error = z.string().safeParse(1).error;
    const mapped = mapError(error);

    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe('INTERNAL_ERROR');
  });

  it('fora de produção expõe name, message e a cadeia de cause em details', () => {
    const error = new Error('No values to set', { cause: new Error('drizzle') });
    const mapped = mapError(error);

    expect(mapped.internal).toBe(true);
    expect(mapped.body.message).toBe('Erro interno. Tente novamente.');
    expect(mapped.body.details).toMatchObject({ name: 'Error', message: 'No values to set' });
    expect(String((mapped.body.details as { stack: string }).stack)).toContain(
      'caused by: Error: drizzle',
    );
  });

  it('valor não-Error vira o typeof e o String()', () => {
    expect(mapError('boom').body.details).toMatchObject({ name: 'string', message: 'boom' });
  });
});

describe('describeError', () => {
  it('desenrola no máximo três níveis de cause', () => {
    const deep = new Error('e', {
      cause: new Error('d', {
        cause: new Error('c', { cause: new Error('b', { cause: new Error('a') }) }),
      }),
    });

    const described = describeError(deep);

    expect(described).toContain('caused by: Error: b');
    expect(described).not.toContain('caused by: Error: a');
  });
});

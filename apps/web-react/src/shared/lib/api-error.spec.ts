import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiErrorCode,
  apiErrorMessage,
  apiFieldErrors,
  applyFieldErrors,
  failureKind,
  isNotFound,
} from '@/shared/lib/api-error';

const zipNotFound = new ApiError(
  404,
  { error: { code: 'NOT_FOUND', message: 'Nenhum documento disponível para baixar.' } },
  'API Error 404',
);

const validation = new ApiError(
  422,
  {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      details: [{ path: ['files'], message: 'Envie no máximo 500 arquivos por vez.' }],
    },
  },
  'API Error 422',
);

const nested = new ApiError(
  422,
  {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      details: [{ path: ['contact', 'email'], message: 'E-mail inválido.' }],
    },
  },
  'x',
);

describe('apiErrorMessage', () => {
  it('usa a mensagem do envelope de erro', () => {
    expect(apiErrorMessage(zipNotFound, 'fallback')).toBe(
      'Nenhum documento disponível para baixar.',
    );
  });

  it('prefere a primeira issue do zod à frase genérica do 422', () => {
    expect(apiErrorMessage(validation, 'fallback')).toBe('Envie no máximo 500 arquivos por vez.');
  });

  it('cai no fallback sem corpo', () => {
    expect(apiErrorMessage(new ApiError(500, null, 'x'), 'fallback')).toBe('fallback');
  });

  it('diz que está sem conexão quando o fetch falha', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Sem conexão com o servidor. Verifique sua internet.',
    );
  });
});

describe('apiFieldErrors', () => {
  it('mapeia o path da issue para o campo', () => {
    expect(apiFieldErrors(validation)).toEqual({ files: 'Envie no máximo 500 arquivos por vez.' });
  });

  it('junta paths aninhados com ponto', () => {
    expect(apiFieldErrors(nested)).toEqual({ 'contact.email': 'E-mail inválido.' });
  });
});

describe('applyFieldErrors', () => {
  it('chama o setError do React Hook Form em cada campo do 422', () => {
    const setError = vi.fn();

    expect(applyFieldErrors(nested, setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith('contact.email', {
      type: 'server',
      message: 'E-mail inválido.',
    });
  });

  it('não faz nada quando o erro não tem campos', () => {
    const setError = vi.fn();

    expect(applyFieldErrors(zipNotFound, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

describe('classificação do erro', () => {
  it('lê o código do envelope', () => {
    expect(apiErrorCode(validation)).toBe('VALIDATION_ERROR');
    expect(apiErrorCode(new Error('x'))).toBeUndefined();
  });

  it('reconhece 404', () => {
    expect(isNotFound(zipNotFound)).toBe(true);
    expect(isNotFound(validation)).toBe(false);
  });

  it('separa offline, sumiu, servidor e outros', () => {
    expect(failureKind(new TypeError('Failed to fetch'))).toBe('offline');
    expect(failureKind(new ApiError(410, null, 'x'))).toBe('gone');
    expect(failureKind(new ApiError(403, null, 'x'))).toBe('gone');
    expect(failureKind(new ApiError(502, null, 'x'))).toBe('server');
    expect(failureKind(validation)).toBe('other');
  });
});

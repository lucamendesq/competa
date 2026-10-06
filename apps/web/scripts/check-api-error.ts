import assert from 'node:assert/strict';
import { ApiError, apiErrorMessage, apiFieldErrors } from '../src/api/error.js';

const zipNotFound = new ApiError(
  404,
  {
    error: {
      code: 'NOT_FOUND',
      message: 'Nenhum documento para baixar (rejeitados não entram na entrega).',
    },
  },
  'API Error 404',
);
assert.equal(
  apiErrorMessage(zipNotFound, 'fallback'),
  'Nenhum documento para baixar (rejeitados não entram na entrega).',
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
assert.equal(apiErrorMessage(validation, 'fallback'), 'Envie no máximo 500 arquivos por vez.');
assert.deepEqual(apiFieldErrors(validation), { files: 'Envie no máximo 500 arquivos por vez.' });

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
assert.deepEqual(apiFieldErrors(nested), { 'contact.email': 'E-mail inválido.' });

assert.equal(apiErrorMessage(new ApiError(500, null, 'x'), 'fallback'), 'fallback');
console.log('check-api-error: ok');

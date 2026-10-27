import { Logger } from '../lib/logger.js';
import * as Sentry from '@sentry/node';
import { APIError } from 'better-auth/api';
import { Cause, Effect } from 'effect';
import { HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/http';
import env from '../config/env.js';
import { DbUnavailable } from '../infra/database/error.js';
import { isAppError } from '../lib/app-error.js';
import { JSON_UTF8 } from './envelope.js';

/** O erro do driver vem embrulhado (DrizzleQueryError > PostgresError): sem a cadeia de
 *  `cause` o log mostra a query e esconde o motivo. */
export const describeError = (error: unknown, depth = 0): string => {
  if (!(error instanceof Error)) return String(error);
  const cause =
    error.cause && depth < 3 ? `\ncaused by: ${describeError(error.cause, depth + 1)}` : '';

  return `${error.stack ?? `${error.name}: ${error.message}`}${cause}`;
};

export type MappedError = {
  readonly status: number;
  readonly body: { code: string; message: string; details?: unknown };
  /** Código a registrar como negação de autorização (OPS-1). */
  readonly denial?: string;
  /** Fallback 500: a borda loga e manda ao Sentry. */
  readonly internal?: boolean;
};

const reasonOf = (error: unknown) =>
  HttpServerError.isHttpServerError(error) ? error.reason : error;

const tagOf = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && '_tag' in value
    ? String((value as { _tag: unknown })._tag)
    : undefined;

/** Sem ramo para `ZodError`: o bug congelado #1 (`?page=abc` → 500) existe justamente
 *  porque ele não casa com nada. */
export const mapError = (error: unknown): MappedError => {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      ...(error.status === 403 ? { denial: error.code } : {}),
    };
  }

  if (error instanceof APIError) {
    const status = error.statusCode ?? 500;
    const denial = status === 403 ? { denial: error.body?.code ?? 'FORBIDDEN' } : {};
    if (status < 500) {
      return {
        status,
        body: {
          code: error.body?.code ?? 'AUTH_ERROR',
          message: error.body?.message ?? 'Erro de autenticação.',
        },
        ...denial,
      };
    }
  }

  if (error instanceof DbUnavailable) {
    return {
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE', message: 'Banco indisponível. Tente novamente.' },
    };
  }

  const reason = reasonOf(error);
  const tag = tagOf(reason);

  if (tag === 'RouteNotFound') {
    return { status: 404, body: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } };
  }

  if (tag === 'RequestParseError') {
    const parse = reason as HttpServerError.RequestParseError;
    return parse.reason === 'BodyTooLarge'
      ? {
          status: 413,
          body: { code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' },
        }
      : {
          status: 400,
          body: { code: 'BAD_REQUEST', message: parse.description ?? 'Corpo inválido.' },
        };
  }

  return {
    status: 500,
    internal: true,
    body: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno. Tente novamente.',
      ...(env.NODE_ENV === 'production'
        ? {}
        : {
            details: {
              name: error instanceof Error ? error.name : typeof error,
              message: error instanceof Error ? error.message : String(error),
              stack: describeError(error),
            },
          }),
    },
  };
};

const logger = new Logger('AppErrorFilter');

/** O `originalUrl` do Effect é absoluto, mas as linhas de log de 403/500 levam só caminho +
 *  query: operadores as comparam nesse formato. */
const loggedUrl = (originalUrl: string) => {
  const schemeless = originalUrl.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');

  return schemeless === '' ? '/' : schemeless;
};

/** Fim de linha de toda rota registrada por `route()` (ver `platform.ts`): mapeia, loga e
 *  escreve. Não é middleware global: o mount do better-auth serializa os próprios erros, e
 *  um mapa global reescreveria a resposta dele. */
export const handleCause = (cause: Cause.Cause<unknown>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const error = Cause.squash(cause);
    const mapped = mapError(error);

    if (mapped.denial !== undefined) {
      const denied = `403 ${mapped.denial}: ${request.method} ${loggedUrl(request.originalUrl)}`;
      logger.warn(denied);
      Sentry.captureMessage(denied, 'warning');
    }

    if (mapped.internal === true) {
      logger.error(`500 ${request.method} ${loggedUrl(request.originalUrl)}`, describeError(error));
      Sentry.captureException(error);
    }

    return HttpServerResponse.jsonUnsafe(
      { error: mapped.body },
      { status: mapped.status, contentType: JSON_UTF8 },
    );
  });

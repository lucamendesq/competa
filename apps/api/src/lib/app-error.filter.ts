import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import * as Sentry from '@sentry/nestjs';
import { AppError } from './app-error.js';

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  /** Negação de guard sem rastro é como um ataque de autorização passa despercebido
   *  (OPS-1): toda 403 deixa linha de log e evento no Sentry, com rota e método. */
  private logDenial(host: ArgumentsHost, code: string) {
    const request = host.switchToHttp().getRequest<Request>();
    const denied = `403 ${code}: ${request.method} ${request.originalUrl ?? request.url}`;

    this.logger.warn(denied);
    Sentry.captureMessage(denied, 'warning');
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      if (exception.status === 403) this.logDenial(host, exception.code);

      return response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details === undefined ? {} : { details: exception.details }),
        },
      });
    }

    if (exception instanceof HttpException && exception.getStatus() === 404) {
      return response
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } });
    }

    if (exception instanceof HttpException && exception.getStatus() === 403) {
      this.logDenial(host, 'FORBIDDEN');

      return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Acesso negado.' } });
    }

    // Rate limit (ThrottlerGuard): tratado à parte porque "devagar aí" não é erro de
    // servidor — devolver 500 aqui faria o cliente achar que o sistema quebrou e repetir.
    if (exception instanceof ThrottlerException) {
      return response.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.',
        },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < 500) {
        const res = exception.getResponse();
        const message =
          typeof res === 'object' && res !== null && 'message' in res
            ? Array.isArray((res as { message: unknown }).message)
              ? (res as { message: unknown[] }).message.join(', ')
              : String((res as { message: unknown }).message)
            : exception.message;

        const code =
          status === 400
            ? 'BAD_REQUEST'
            : status === 413
              ? 'PAYLOAD_TOO_LARGE'
              : status === 401
                ? 'UNAUTHENTICATED'
                : 'HTTP_ERROR';

        return response.status(status).json({
          error: {
            code,
            message,
          },
        });
      }
    }

    this.logger.error(exception);
    Sentry.captureException(exception);
    return response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
  }
}

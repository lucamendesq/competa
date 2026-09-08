import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { AppError } from './app-error.js';

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
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

    this.logger.error(exception);
    return response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
  }
}

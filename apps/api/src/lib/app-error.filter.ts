import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
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

    // HttpException (exceto 404) e erro desconhecido: nunca vaza detalhe para o cliente
    this.logger.error(exception);
    return response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
  }
}

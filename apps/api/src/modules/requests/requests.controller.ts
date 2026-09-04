import { Controller, Get, Param, Post } from '@nestjs/common';
import { IdParam } from '@contabilidade/contracts';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { RequestRepository } from './request.repository.js';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestRepository) {}

  @Get(':id')
  async get(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const row = await this.requests.findById(scope, params.id);
    if (!row) throw new NotFound('Solicitação não encontrada.');

    return row;
  }

  /** Encerrar é ato exclusivo do Contador e vale mesmo com pendências (aviso na resposta). */
  @Post(':id/close')
  async close(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const closed = await this.requests.closeRequest(scope, params.id);
    if (!closed) throw new NotFound('Solicitação não encontrada.');

    return {
      ...closed,
      warning: closed.pendingItemCount
        ? `Solicitação encerrada com ${closed.pendingItemCount} item(ns) sem aceite.`
        : null,
    };
  }
}

import { Controller, Get, Param } from '@nestjs/common';
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
}

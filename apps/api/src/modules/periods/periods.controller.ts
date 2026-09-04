import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IdParam, OpenPeriodBody, PaginationQuery } from '@contabilidade/contracts';
import { NotFound } from '../../lib/app-error.js';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import env from '../../config/env.js';
import { PeriodRepository } from './period.repository.js';

@Controller('periods')
export class PeriodsController {
  constructor(private readonly periods: PeriodRepository) {}

  @Post()
  async open(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(OpenPeriodBody)) body: OpenPeriodBody,
  ) {
    const { period, warnings, plans, requestIdByCompany } = await this.periods.openPeriod(
      scope,
      body,
    );

    return {
      ...period,
      warnings,
      requests: plans.map((plan) => ({
        id: requestIdByCompany.get(plan.companyId),
        companyId: plan.companyId,
        companyName: plan.companyName,
        itemCount: plan.items.length,
        /** único momento em que o token existe em claro; a Fase 5 troca isto por email */
        uploadUrl: `${env.WEB_URL}/envio/${plan.token}`,
      })),
    };
  }

  @Get()
  async list(
    @CurrentScope() scope: FirmScope,
    @Query(zodPipe(PaginationQuery)) query: PaginationQuery,
  ) {
    const { rows, total } = await this.periods.list(scope, query);

    return paginated(rows, { page: query.page, perPage: query.perPage, total });
  }

  @Get(':id')
  async get(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const row = await this.periods.findById(scope, params.id);
    if (!row) throw new NotFound('Competência não encontrada.');

    return row;
  }

  @Get(':id/requests')
  async listRequests(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    if (!(await this.periods.findOwnedId(scope, params.id))) {
      throw new NotFound('Competência não encontrada.');
    }

    return this.periods.listRequests(scope, params.id);
  }
}

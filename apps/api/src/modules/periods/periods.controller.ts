import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IdParam, OpenPeriodBody, PaginationQuery } from '@competa/contracts';
import { NotFound } from '../../lib/app-error.js';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import env from '../../config/env.js';
import { EVENTS, type RequestCreatedEvent } from '../../lib/events.js';
import { MessageRepository } from '../messaging/message.repository.js';
import { PeriodRepository } from './period.repository.js';

@Controller('periods')
export class PeriodsController {
  constructor(
    private readonly periods: PeriodRepository,
    private readonly events: EventEmitter2,
    private readonly messages: MessageRepository,
  ) { }

  @Post()
  async open(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(OpenPeriodBody)) body: OpenPeriodBody,
  ) {
    const { period, warnings, plans, requestIdByCompany } = await this.periods.openPeriod(
      scope,
      body,
    );

    const requests = plans.map((plan) => ({
      id: requestIdByCompany.get(plan.companyId)!,
      companyId: plan.companyId,
      companyName: plan.companyName,
      itemCount: plan.items.length,
      /** único momento em que o token existe em claro; a Fase 5 o entrega por email */
      uploadUrl: `${env.WEB_URL}/envio/${plan.token}`,
    }));

    // messaging escuta e entrega o link ao Responsável (Fase 5). Emitido depois da
    // transação: o email não pode sair por uma abertura que deu rollback.
    for (const [index, plan] of plans.entries()) {
      const created: RequestCreatedEvent = {
        requestId: requests[index].id,
        periodId: period.id,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
        companyId: plan.companyId,
        companyName: plan.companyName,
        contactId: plan.contactId,
        contactName: plan.contactName,
        contactEmail: plan.contactEmail,
        contactPhone: plan.contactPhone,
        uploadUrl: requests[index].uploadUrl,
        itemCount: plan.items.length,
      };

      this.events.emit(EVENTS.RequestCreated, created);
    }

    return { ...period, warnings, requests };
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

  @Get(':id/pending-panel')
  async pendingPanel(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    if (!(await this.periods.findOwnedId(scope, params.id))) {
      throw new NotFound('Competência não encontrada.');
    }

    const [companies, failures] = await Promise.all([
      this.periods.pendingPanel(scope, params.id),
      this.messages.failuresByPeriod(scope, params.id),
    ]);

    const failuresByRequest = new Map<string, typeof failures>();
    for (const failure of failures) {
      failuresByRequest.set(failure.requestId, [
        ...(failuresByRequest.get(failure.requestId) ?? []),
        failure,
      ]);
    }

    return companies.map((company) => ({
      ...company,
      channelFailures: failuresByRequest.get(company.requestId) ?? [],
    }));
  }

  @Post(':id/close')
  async close(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const closed = await this.periods.closePeriod(scope, params.id);
    if (!closed) throw new NotFound('Competência não encontrada.');

    return {
      ...closed,
      warning: closed.pendingItemCount
        ? `Competência encerrada com ${closed.pendingItemCount} item(ns) sem aceite.`
        : null,
    };
  }
}

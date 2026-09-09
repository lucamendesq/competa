import { Controller, Get, Param, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IdParam } from '@contabilidade/contracts';
import env from '../../config/env.js';
import { EVENTS, type UploadLinkResentEvent } from '../../lib/events.js';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { RequestRepository } from './request.repository.js';

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestRepository,
    private readonly events: EventEmitter2,
  ) {}

  @Get(':id')
  async get(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const row = await this.requests.findById(scope, params.id);
    if (!row) throw new NotFound('Solicitação não encontrada.');

    return row;
  }

  /** O token fica hasheado no banco, então não existe "mostrar o link atual": copiar gera
   *  um link novo e invalida o anterior. A rota é POST por isso. */
  @Post(':id/upload-link')
  async uploadLink(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    return this.rotate(scope, params.id, false);
  }

  @Post(':id/upload-link/resend')
  async resendUploadLink(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
  ) {
    return this.rotate(scope, params.id, true);
  }

  private async rotate(scope: FirmScope, requestId: string, notify: boolean) {
    const link = await this.requests.rotateUploadLink(scope, requestId);
    if (!link) throw new NotFound('Solicitação não encontrada.');

    const uploadUrl = `${env.WEB_URL}/envio/${link.token}`;

    if (notify) {
      const resent: UploadLinkResentEvent = {
        requestId,
        referenceMonth: link.referenceMonth,
        periodDueDate: link.periodDueDate,
        companyName: link.companyName,
        contactName: link.contactName,
        contactEmail: link.contactEmail,
        uploadUrl,
      };

      this.events.emit(EVENTS.UploadLinkResent, resent);
    }

    return { uploadUrl, contactEmail: link.contactEmail };
  }

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

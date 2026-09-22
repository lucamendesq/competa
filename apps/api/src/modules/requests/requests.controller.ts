import { Controller, Get, Param, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IdParam } from '@competa/contracts';
import env from '../../config/env.js';
import { EVENTS, type UploadLinkResentEvent } from '../../lib/events.js';
import { NotFound, ServiceUnavailable } from '../../lib/app-error.js';
import { createToken } from '../../lib/token.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { RequestRepository } from './request.repository.js';
import { InvalidTransition } from './errors.js';

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
    if (notify) {
      const context = await this.requests.uploadLinkContext(scope, requestId);
      if (!context) throw new NotFound('Solicitação não encontrada.');
      if (context.requestStatus === 'closed') {
        throw new InvalidTransition('Solicitação encerrada — não há mais link de envio.');
      }

      const { token, tokenHash } = createToken();
      const uploadUrl = `${env.WEB_URL}/envio/${token}`;
      const resent: UploadLinkResentEvent = {
        requestId,
        referenceMonth: context.referenceMonth,
        periodDueDate: context.periodDueDate,
        companyName: context.companyName,
        contactName: context.contactName,
        contactEmail: context.contactEmail,
        uploadUrl,
      };

      const delivered = await this.events.emitAsync(EVENTS.UploadLinkResent, resent);
      if (!delivered.includes(true)) {
        throw new ServiceUnavailable(
          'Não foi possível entregar o novo link por email. Tente novamente.',
        );
      }

      await this.requests.applyUploadToken(requestId, tokenHash);
      return { uploadUrl, contactEmail: context.contactEmail };
    }

    const link = await this.requests.rotateUploadLink(scope, requestId);
    if (!link) throw new NotFound('Solicitação não encontrada.');

    return { uploadUrl: `${env.WEB_URL}/envio/${link.token}`, contactEmail: link.contactEmail };
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

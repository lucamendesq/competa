import { Body, Controller, Param, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IdParam, RejectDocumentBody } from '@contabilidade/contracts';
import env from '../../config/env.js';
import { NotFound } from '../../lib/app-error.js';
import {
  EVENTS,
  type ItemReopenedEvent,
  type RequestCompletedEvent,
} from '../../lib/events.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { DeadlineCron } from './deadline.cron.js';
import { RequestRepository } from './request.repository.js';

/** Revisão no painel do Contador (sessão + FirmScope). Recurso de outra Contabilidade
 *  responde 404: o join até `period` não o alcança e nada revela que ele existe. */
@Controller()
export class ReviewController {
  constructor(
    private readonly requests: RequestRepository,
    private readonly deadlines: DeadlineCron,
    private readonly events: EventEmitter2,
  ) {}

  @Post('request-items/:id/accept')
  async acceptItem(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const result = await this.requests.acceptItem(scope, params.id);
    if (!result) throw new NotFound('Item não encontrado.');

    if (result.completed) {
      const completed: RequestCompletedEvent = {
        requestId: result.requestId,
        companyName: result.companyName,
        contactName: result.contactName,
        contactEmail: result.contactEmail,
      };

      this.events.emit(EVENTS.RequestCompleted, completed);
    }

    return result;
  }

  @Post('documents/:id/reject')
  async rejectDocument(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(RejectDocumentBody)) body: RejectDocumentBody,
  ) {
    const result = await this.requests.rejectDocument(scope, params.id, body.rejectionReason);
    if (!result) throw new NotFound('Documento não encontrado.');

    const uploadUrl = `${env.WEB_URL}/envio/${result.token}`;

    // Emitido depois da transação: o email de reenvio não pode sair por uma rejeição que
    // deu rollback. Quem entrega é a Fase 5 (SÓ email, invariante do domínio).
    const reopened: ItemReopenedEvent = {
      requestId: result.requestId,
      requestItemId: result.requestItemId,
      itemName: result.itemName,
      rejectionReason: result.rejectionReason,
      companyName: result.companyName,
      contactName: result.contactName,
      contactEmail: result.contactEmail,
      uploadUrl,
    };

    this.events.emit(EVENTS.ItemReopened, reopened);

    return {
      documentId: params.id,
      fileName: result.fileName,
      reviewStatus: 'rejected',
      requestItemId: result.requestItemId,
      itemStatus: 'pending',
      requestStatus: result.requestStatus,
      linkRotated: true,
    };
  }

  /** Disparo manual da varredura de prazo (operação/verificação enquanto não há UI e o
   *  cron diário é a única entrada). Escopado à Contabilidade da sessão. */
  @Post('deadlines/scan')
  async scanDeadlines(@CurrentScope() scope: FirmScope) {
    return this.deadlines.scan(scope);
  }
}

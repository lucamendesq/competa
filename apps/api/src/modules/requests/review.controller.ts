import { Body, Controller, Param, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IdParam,
  RejectDocumentBody,
  ReviewBatchBody,
  ReviewExtraBody,
} from '@contabilidade/contracts';
import env from '../../config/env.js';
import { NotFound } from '../../lib/app-error.js';
import {
  EVENTS,
  type ItemReopenedEvent,
  type RequestCompletedEvent,
  type ReviewPublishedEvent,
} from '../../lib/events.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentAccountantId } from '../auth/current-accountant.decorator.js';
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
  async acceptItem(
    @CurrentScope() scope: FirmScope,
    @CurrentAccountantId() accountantId: string,
    @Param(zodPipe(IdParam)) params: IdParam,
  ) {
    const result = await this.requests.acceptItem(scope, params.id, accountantId);
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

  /** A revisão da tela inteira publicada de uma vez. Um email só sai daqui:
   *  `ReviewPublished` quando houve rejeição, `RequestCompleted` quando o lote fechou a
   *  Solicitação — nunca os dois (completar exige todo item aceito). Só aceite que não
   *  completa não manda email, igual à rota unitária. */
  @Post('requests/:id/review')
  async publishReview(
    @CurrentScope() scope: FirmScope,
    @CurrentAccountantId() accountantId: string,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(ReviewBatchBody)) body: ReviewBatchBody,
  ) {
    const result = await this.requests.applyReview(scope, params.id, body, accountantId);
    if (!result) throw new NotFound('Solicitação não encontrada.');

    // Depois da transação: um email de recusa não pode sair por uma revisão que deu
    // rollback (mesma ordem da rota unitária).
    if (result.rejected.length) {
      const published: ReviewPublishedEvent = {
        requestId: result.requestId,
        companyName: result.companyName,
        contactName: result.contactName,
        contactEmail: result.contactEmail,
        acceptedItemNames: result.acceptedItemNames,
        rejected: result.rejected,
        uploadUrl: result.token ? `${env.WEB_URL}/envio/${result.token}` : null,
      };

      this.events.emit(EVENTS.ReviewPublished, published);
    } else if (result.completed) {
      const completed: RequestCompletedEvent = {
        requestId: result.requestId,
        companyName: result.companyName,
        contactName: result.contactName,
        contactEmail: result.contactEmail,
      };

      this.events.emit(EVENTS.RequestCompleted, completed);
    }

    return {
      requestId: result.requestId,
      requestStatus: result.requestStatus,
      completed: result.completed,
      acceptedItems: result.acceptedItemNames.length,
      rejectedDocuments: result.rejected.length,
      linkRotated: Boolean(result.token),
      emailSent: result.rejected.length > 0 || result.completed,
    };
  }

  @Post('documents/:id/reject')
  async rejectDocument(
    @CurrentScope() scope: FirmScope,
    @CurrentAccountantId() accountantId: string,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(RejectDocumentBody)) body: RejectDocumentBody,
  ) {
    const result = await this.requests.rejectDocument(
      scope,
      params.id,
      body.rejectionReason,
      accountantId,
    );
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

  @Post('documents/:id/review-extra')
  async reviewExtra(
    @CurrentScope() scope: FirmScope,
    @CurrentAccountantId() accountantId: string,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(ReviewExtraBody)) body: ReviewExtraBody,
  ) {
    const result = await this.requests.reviewExtraDocument(
      scope,
      params.id,
      { reviewStatus: body.decision, rejectionReason: body.rejectionReason },
      accountantId,
    );
    if (!result) throw new NotFound('Documento não encontrado.');

    return result;
  }

  @Post('request-items/:id/undo-accept')
  async undoAccept(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const result = await this.requests.undoAcceptItem(scope, params.id);
    if (!result) throw new NotFound('Item não encontrado.');

    return result;
  }

  @Post('deadlines/scan')
  async scanDeadlines(@CurrentScope() scope: FirmScope) {
    return this.deadlines.scan(scope);
  }
}

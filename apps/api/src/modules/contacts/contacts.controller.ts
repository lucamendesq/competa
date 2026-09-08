import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IdParam,
  MyPresignBody,
  PaginationQuery,
  PushSubscriptionBody,
} from '@contabilidade/contracts';
import { ConfirmUploadBody } from '@contabilidade/contracts';
import { NotFound } from '../../lib/app-error.js';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { ContactRoute } from '../auth/contact-route.decorator.js';
import { CurrentContactScope } from '../auth/contact-scope.decorator.js';
import { ContactUploadGuard } from '../auth/contact-upload.guard.js';
import { CurrentUploadScope } from '../auth/upload-scope.decorator.js';
import type { ContactScope, UploadScope } from '../auth/scope.js';
import { effectiveDueDate } from '../requests/review-rules.js';
import { UploadService } from '../requests/upload.service.js';
import { ContactRepository } from './contact.repository.js';

/** Área logada do Responsável (Fase 10). Todas as rotas são `ContactScope`: a Empresa dele
 *  e mais nada. Nenhuma devolve conteúdo de documento — só nome, status, prazo e autoria. */
@Controller('my')
@ContactRoute()
export class ContactsController {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly uploads: UploadService,
  ) {}

  @Get('profile')
  async profile(@CurrentContactScope() scope: ContactScope) {
    const row = await this.contacts.profile(scope);
    if (!row) throw new NotFound('Responsável não encontrado.');

    return row;
  }

  @Get('pending')
  async pending(@CurrentContactScope() scope: ContactScope) {
    const rows = await this.contacts.pending(scope);

    return rows.map((row) => ({
      requestId: row.requestId,
      periodId: row.periodId,
      referenceMonth: row.referenceMonth,
      item: {
        id: row.itemId,
        name: row.itemName,
        description: row.description,
        acceptedFormats: row.acceptedFormats,
        status: row.itemStatus,
        dueDate: effectiveDueDate({ dueDate: row.itemDueDate, periodDueDate: row.periodDueDate }),
        rejections: row.rejections,
      },
    }));
  }

  @Get('periods')
  async periods(
    @CurrentContactScope() scope: ContactScope,
    @Query(zodPipe(PaginationQuery)) query: PaginationQuery,
  ) {
    const { rows, total } = await this.contacts.periods(scope, query);

    return paginated(rows, { page: query.page, perPage: query.perPage, total });
  }

  @Get('periods/:id')
  async periodDetail(
    @CurrentContactScope() scope: ContactScope,
    @Param(zodPipe(IdParam)) params: IdParam,
  ) {
    const row = await this.contacts.periodDetail(scope, params.id);
    if (!row) throw new NotFound('Competência não encontrada.');

    return row;
  }

  @Post('push/subscribe')
  async subscribe(
    @CurrentContactScope() scope: ContactScope,
    @Body(zodPipe(PushSubscriptionBody)) body: PushSubscriptionBody,
  ) {
    return this.contacts.savePushSubscription(scope, body);
  }

  @Delete('push/subscribe')
  @HttpCode(204)
  async unsubscribe(
    @CurrentContactScope() scope: ContactScope,
    @Body(zodPipe(PushSubscriptionBody.pick({ endpoint: true }))) body: { endpoint: string },
  ) {
    const row = await this.contacts.deletePushSubscription(scope, body.endpoint);
    if (!row) throw new NotFound('Inscrição não encontrada.');
  }
}

/** Upload logado: `ContactUploadGuard` confere a Solicitação contra a Empresa do
 *  Responsável e produz o mesmo `UploadScope` do fluxo por link — daí em diante é o
 *  pipeline da Fase 4, sem regra duplicada. Controller separado porque o guard é outro. */
@Controller('my/documents')
@ContactRoute()
@UseGuards(ContactUploadGuard)
export class ContactUploadController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  async presign(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(MyPresignBody)) body: MyPresignBody,
  ) {
    return this.uploads.presign(scope, body);
  }

  @Post('confirm')
  async confirm(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(ConfirmUploadBody.extend({ requestId: MyPresignBody.shape.requestId })))
    body: ConfirmUploadBody,
  ) {
    return this.uploads.confirm(scope, body.documentIds);
  }
}

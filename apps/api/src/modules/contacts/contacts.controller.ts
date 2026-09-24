import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  IdParam,
  MyPresignBody,
  PaginationQuery,
  PushSubscriptionBody,
  SetPasswordBody,
} from '@competa/contracts';

import { ConfirmUploadBody } from '@competa/contracts';
import type { Request } from 'express';
import { NotFound } from '../../lib/app-error.js';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { ContactRoute } from '../auth/contact-route.decorator.js';
import { CurrentContactScope } from '../auth/contact-scope.decorator.js';
import { ContactUploadGuard } from '../auth/contact-upload.guard.js';
import { CurrentUploadScope } from '../auth/upload-scope.decorator.js';
import type { ContactScope, UploadScope } from '../auth/scope.js';
import * as z from 'zod';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { effectiveDueDate } from '../requests/review-rules.js';
import { servedContentType } from '../requests/file-rules.js';
import { DocumentRepository } from '../requests/document.repository.js';
import { AuthProvider } from '../auth/auth-provider.js';
import { ContactRepository } from './contact.repository.js';
import { RequestRepository } from '../requests/request.repository.js';
import { PeriodRepository } from '../periods/period.repository.js';
import { MessageRepository } from '../messaging/message.repository.js';

const PeriodDetailQuery = z.object({ companyId: z.uuid().optional() });
type PeriodDetailQuery = z.infer<typeof PeriodDetailQuery>;

@Controller('my')
@ContactRoute()
export class ContactsController {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly requests: RequestRepository,
    private readonly periodRepo: PeriodRepository,
    private readonly messages: MessageRepository,
    private readonly storage: StorageProvider,
    private readonly auth: AuthProvider,
  ) {}

  @Get('profile')
  async profile(@CurrentContactScope() scope: ContactScope) {
    const row = await this.contacts.profile(scope);
    if (!row) throw new NotFound('Responsável não encontrado.');

    return row;
  }

  @Get('pending')
  async pending(@CurrentContactScope() scope: ContactScope) {
    const rows = await this.requests.pending(scope);

    return rows.map((row) => ({
      requestId: row.requestId,
      periodId: row.periodId,
      referenceMonth: row.referenceMonth,
      companyId: row.companyId,
      companyName: row.companyName,
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
    const { rows, total } = await this.periodRepo.periods(scope, query);

    return paginated(rows, { page: query.page, perPage: query.perPage, total });
  }

  @Get('periods/:id')
  async periodDetail(
    @CurrentContactScope() scope: ContactScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Query(zodPipe(PeriodDetailQuery)) query: PeriodDetailQuery,
  ) {
    const row = await this.periodRepo.periodDetail(scope, params.id, query.companyId);
    if (!row) throw new NotFound('Competência não encontrada.');

    return row;
  }

  @Get('documents/:id/content')
  async documentContent(
    @CurrentContactScope() scope: ContactScope,
    @Param(zodPipe(IdParam)) params: IdParam,
  ) {
    const found = await this.requests.documentForRead(scope, params.id);
    if (!found) throw new NotFound('Documento não encontrado.');

    const { contentType, inline } = servedContentType(found.contentType);

    return new StreamableFile(await this.storage.openRead(found.storageKey), {
      type: contentType,
      disposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
    });
  }

  @Post('push/subscribe')
  async subscribe(
    @CurrentContactScope() scope: ContactScope,
    @Body(zodPipe(PushSubscriptionBody)) body: PushSubscriptionBody,
  ) {
    return this.messages.savePushSubscription(scope, body);
  }

  @Delete('push/subscribe')
  @HttpCode(204)
  async unsubscribe(
    @CurrentContactScope() scope: ContactScope,
    @Body(zodPipe(PushSubscriptionBody.pick({ endpoint: true }))) body: { endpoint: string },
  ) {
    const row = await this.messages.deletePushSubscription(scope, body.endpoint);
    if (!row) throw new NotFound('Inscrição não encontrada.');
  }

  /** Define ou redefine a senha do Responsável autenticado. Funciona para contas criadas
   *  por magic-link (sem credencial) — a first-time call cria a credencial. */
  @Post('password')
  @HttpCode(204)
  async setPassword(@Req() req: Request, @Body(zodPipe(SetPasswordBody)) body: SetPasswordBody) {
    await this.auth.setPassword(req.headers, body.password);
  }
}

/** Upload logado: `ContactUploadGuard` confere a Solicitação contra a Empresa do
 *  Responsável e produz o mesmo `UploadScope` do fluxo por link — daí em diante é o
 *  pipeline da Fase 4, sem regra duplicada. Controller separado porque o guard é outro. */
@Controller('my/documents')
@ContactRoute()
@UseGuards(ContactUploadGuard)
export class ContactUploadController {
  constructor(private readonly documents: DocumentRepository) {}

  @Post()
  async presign(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(MyPresignBody)) body: MyPresignBody,
  ) {
    return this.documents.presign(scope, body);
  }

  @Post('confirm')
  async confirm(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(ConfirmUploadBody.extend({ requestId: MyPresignBody.shape.requestId })))
    body: ConfirmUploadBody,
  ) {
    return this.documents.confirm(scope, body.documentIds);
  }
}

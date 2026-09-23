import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SkipThrottle } from '@nestjs/throttler';
import { UploadThrottlerGuard } from './upload-throttler.guard.js';
import { ConfirmUploadBody, PresignUploadBody } from '@competa/contracts';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { CurrentUploadScope } from '../auth/upload-scope.decorator.js';
import type { UploadScope } from '../auth/scope.js';
import { DocumentRepository } from './document.repository.js';
import { UploadLinkRepository } from './upload-link.repository.js';

@Controller('upload/:token')
@AllowAnonymous()
@UseGuards(UploadThrottlerGuard, UploadTokenGuard)
export class UploadController {
  constructor(
    private readonly links: UploadLinkRepository,
    private readonly documents: DocumentRepository,
  ) {}

  @Get()
  async checklist(@CurrentUploadScope() scope: UploadScope) {
    const [checklist, owner] = await Promise.all([
      this.links.findChecklist(scope),
      this.links.findContact(scope),
    ]);
    if (!checklist) throw new NotFound('Solicitação não encontrada.');

    return {
      company: checklist.companyName,
      accountingFirm: checklist.accountingFirmName,
      hasAccess: Boolean(owner?.authUserId),
      referenceMonth: checklist.referenceMonth,
      dueDate: checklist.periodDueDate,
      status: checklist.status,
      items: checklist.items.map((item) => ({
        ...item,
        dueDate: item.dueDate ?? checklist.periodDueDate,
      })),
      extraDocuments: checklist.extraDocuments,
    };
  }

  @SkipThrottle({ short: true, default: true })
  @Post('documents')
  async presign(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(PresignUploadBody)) body: PresignUploadBody,
  ) {
    return this.documents.presign(scope, body);
  }

  @Post('documents/confirm')
  async confirm(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(ConfirmUploadBody)) body: ConfirmUploadBody,
  ) {
    return this.documents.confirm(scope, body.documentIds);
  }
}

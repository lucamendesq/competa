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
import { UploadService } from './upload.service.js';
import { UploadLinkRepository } from './upload-link.repository.js';

/** Rotas públicas do Link de Upload: só-escrita. Exibem nome/status/prazo dos Itens e o
 *  NOME dos arquivos já enviados (o Responsável precisa saber o que mandou), mas nunca
 *  devolvem conteúdo de `document` nem `storage_key`, e não existe rota de download aqui. `@AllowAnonymous()` porque o
 *  TenantGuard é global e este fluxo não passa pelo Better Auth. */
@Controller('upload/:token')
@AllowAnonymous()
@UseGuards(UploadTokenGuard)
export class UploadController {
  constructor(
    private readonly links: UploadLinkRepository,
    private readonly uploads: UploadService,
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
      /* A tela de sucesso não oferece "ativar acesso" a quem já tem — a rota responderia
       * 409 e o Responsável veria um erro por clicar no que lhe foi oferecido. */
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
  @UseGuards(UploadThrottlerGuard)
  @Post('documents')
  async presign(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(PresignUploadBody)) body: PresignUploadBody,
  ) {
    return this.uploads.presign(scope, body);
  }

  @Post('documents/confirm')
  async confirm(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(ConfirmUploadBody)) body: ConfirmUploadBody,
  ) {
    return this.uploads.confirm(scope, body.documentIds);
  }
}

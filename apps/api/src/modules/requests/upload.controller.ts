import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle, seconds } from '@nestjs/throttler';
import { ConfirmUploadBody, PresignUploadBody } from '@contabilidade/contracts';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { CurrentUploadScope } from '../auth/upload-scope.decorator.js';
import type { UploadScope } from '../auth/scope.js';
import { UploadService } from './upload.service.js';
import { UploadLinkRepository } from './upload-link.repository.js';

/** Rotas públicas do Link de Upload: só-escrita. Exibem nome/status/prazo dos Itens,
 *  nunca listam nem devolvem conteúdo de `document`. `@AllowAnonymous()` porque o
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
    const checklist = await this.links.findChecklist(scope);
    if (!checklist) throw new NotFound('Solicitação não encontrada.');

    return {
      company: checklist.companyName,
      referenceMonth: checklist.referenceMonth,
      dueDate: checklist.periodDueDate,
      status: checklist.status,
      items: checklist.items.map((item) => ({
        ...item,
        dueDate: item.dueDate ?? checklist.periodDueDate,
      })),
    };
  }

  /* Presign é a rota que custa: cria linha e assina URL. Com um token válido, sem limite,
   * dá para inflar banco e storage. */
  @Throttle({ default: { ttl: seconds(60), limit: 20 } })
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

import { Controller, Param, Put, Query, Req } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { LocalStorage } from './local.storage.js';

/** Só existe quando o storage é o LocalStorage de desenvolvimento: é o destino
 *  da "URL pré-assinada" que substitui o R2. Em produção quem recebe o PUT é o R2. */
@Controller('storage/local')
export class LocalStorageController {
  constructor(private readonly storage: LocalStorage) {}

  @Put(':storageKey')
  @AllowAnonymous()
  async put(
    @Param('storageKey') storageKey: string,
    @Query('expiresAt') expiresAt: string,
    @Query('signature') signature: string,
    @Req() request: Request,
  ) {
    await this.storage.write({
      storageKey,
      expiresAt: Number(expiresAt),
      signature: signature ?? '',
      body: request,
    });

    return { storageKey };
  }
}

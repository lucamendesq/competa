import { Controller, Param, Put, Query, Req } from '@nestjs/common';
import { ValidationError } from '../../lib/app-error.js';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { LocalStorage } from './local.storage.js';

/** Só existe quando o storage é o LocalStorage de desenvolvimento: é o destino
 *  da "URL pré-assinada" que substitui o R2. Em produção quem recebe o PUT é o R2. */
@Controller('storage/local')
export class LocalStorageController {
  constructor(private readonly storage: LocalStorage) {}

  /* Upload de N arquivos bate aqui N vezes em sequência: contar isso como rajada
   * quebraria envio legítimo de lote. O limite real está no presign, que autoriza. */
  @SkipThrottle()
  @Put(':storageKey')
  @AllowAnonymous()
  async put(
    @Param('storageKey') storageKey: string,
    @Query('expiresAt') expiresAt: string,
    @Query('sizeBytes') sizeBytes: string,
    @Query('signature') signature: string,
    @Req() request: Request,
  ) {
    // Um body parser antes desta rota (json/urlencoded do Better Auth) já pode ter drenado
    // o stream — gravar assim daria arquivo de 0 byte com HTTP 200, que é o pior defeito
    // possível num fluxo de upload. Melhor recusar alto. O R2 não tem esse problema: lá o
    // PUT vai direto para o storage, sem passar pela nossa API.
    if (request.readableEnded) {
      throw new ValidationError(
        'Envie o arquivo com content-type binário (ex.: application/pdf ou application/octet-stream).',
      );
    }

    await this.storage.write({
      storageKey,
      expiresAt: Number(expiresAt),
      sizeBytes: Number(sizeBytes),
      signature: signature ?? '',
      body: request,
    });

    return { storageKey };
  }
}

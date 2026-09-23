import { Readable } from 'node:stream';
import { Controller, Get, Logger, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { IdParam } from '@competa/contracts';
import { ZipArchive } from 'archiver';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { servedContentType } from './file-rules.js';
import { RequestRepository } from './request.repository.js';
import { zipEntries, zipFileName, type ZipEntry } from './zip.js';
import { ZipFlightService } from './zip-flight.service.js';

@Controller()
export class ZipController {
  private readonly logger = new Logger(ZipController.name);

  constructor(
    private readonly requests: RequestRepository,
    private readonly storage: StorageProvider,
    private readonly flight: ZipFlightService,
  ) {}

  @Get('requests/:id/zip')
  async requestZip(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.flight.execute(`requests:${params.id}`, async () => {
      const found = await this.requests.documentsForRequestZip(scope, params.id);
      if (!found) throw new NotFound('Solicitação não encontrada.');

      return this.stream(
        zipEntries(found.documents, false),
        zipFileName(found.companyName, found.referenceMonth),
        res,
        params.id,
      );
    });
  }

  @Get('periods/:id/zip')
  async periodZip(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.flight.execute(`periods:${params.id}`, async () => {
      const found = await this.requests.documentsForPeriodZip(scope, params.id);
      if (!found) throw new NotFound('Competência não encontrada.');

      return this.stream(
        zipEntries(found.documents, true),
        zipFileName(`competencia ${found.referenceMonth.slice(0, 7)}`, found.referenceMonth),
        res,
        params.id,
      );
    });
  }

  @Get('documents/:id/content')
  async documentContent(
    @CurrentScope() scope: FirmScope,
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

  private stream(entries: ZipEntry[], fileName: string, res: Response, targetId: string) {
    if (entries.length === 0) {
      throw new NotFound('Nenhum documento para baixar (rejeitados não entram na entrega).');
    }

    const archive = new ZipArchive({ store: true });

    res.on('close', () => {
      if (!res.writableEnded) {
        this.logger.warn(`Cliente desconectou: abortando zip de ${targetId}`);
        this.abort(archive, new Error('Client disconnected'));
      }
    });

    for (const entry of entries) {
      archive.append(this.lazyRead(entry.storageKey, archive), { name: entry.path });
    }

    archive.finalize().catch((error: unknown) => this.abort(archive, error));

    return new StreamableFile(archive, {
      type: 'application/zip',
      disposition: `attachment; filename="${fileName}"`,
    }).setErrorHandler((error, response) => {
      this.abort(archive, error);
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
  }

  private abort(archive: ZipArchive, error: unknown) {
    this.logger.error(`zip interrompido no meio do stream: ${String(error)}`);
    if (!archive.destroyed) archive.destroy();
  }

  private lazyRead(storageKey: string, archive: ZipArchive) {
    const storage = this.storage;
    const abort = (err: unknown) => this.abort(archive, err);

    return Readable.from(
      (async function* () {
        try {
          const source = await storage.openRead(storageKey);
          yield* source;
        } catch (error) {
          abort(error);
          throw error;
        }
      })(),
      { objectMode: false },
    );
  }
}

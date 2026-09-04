import { Readable } from 'node:stream';
import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { IdParam } from '@contabilidade/contracts';
// archiver 8 exporta classes, não uma função default
import { ZipArchive } from 'archiver';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { RequestRepository } from './request.repository.js';
import { zipEntries, zipFileName, type ZipEntry } from './zip.js';

/** Entrega em zip. Streaming de ponta a ponta: o arquivo nunca existe inteiro em memória
 *  nem em disco — o R2 é lido por stream e o zip sai pela resposta enquanto é montado. */
@Controller()
export class ZipController {
  constructor(
    private readonly requests: RequestRepository,
    private readonly storage: StorageProvider,
  ) {}

  /** TASK-033 — tudo de UMA Empresa numa Competência. */
  @Get('requests/:id/zip')
  async requestZip(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const found = await this.requests.documentsForRequestZip(scope, params.id);
    if (!found) throw new NotFound('Solicitação não encontrada.');

    return this.stream(
      zipEntries(found.documents, false),
      zipFileName(found.companyName, found.referenceMonth),
    );
  }

  /** TASK-034 — a Competência inteira, uma pasta por Empresa. */
  @Get('periods/:id/zip')
  async periodZip(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const found = await this.requests.documentsForPeriodZip(scope, params.id);
    if (!found) throw new NotFound('Competência não encontrada.');

    return this.stream(
      zipEntries(found.documents, true),
      zipFileName(`competencia ${found.referenceMonth.slice(0, 7)}`, found.referenceMonth),
    );
  }

  private stream(entries: ZipEntry[], fileName: string) {
    if (entries.length === 0) {
      throw new NotFound('Nenhum documento para baixar (rejeitados não entram na entrega).');
    }

    // store: os documentos já chegam comprimidos (pdf, xml zipado, imagem) — gastar CPU
    // recomprimindo não paga, e egress do R2 é grátis.
    const archive = new ZipArchive({ store: true });

    for (const entry of entries) {
      archive.append(this.lazyRead(entry.storageKey), { name: entry.path });
    }

    // sem await: finalize() só termina quando o consumidor drenar a resposta
    void archive.finalize();

    // o content-type sai daqui, e não de um @Header: com o header fixo na rota, o 404
    // "nenhum documento" saía rotulado como application/zip e o cliente baixava um
    // arquivo quebrado em vez de ver o erro.
    return new StreamableFile(archive, {
      type: 'application/zip',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  /** Stream que só abre a conexão com o storage quando o archiver chega naquela entrada —
   *  abrir os 500 de uma vez estouraria o pool de sockets numa competência grande. */
  private lazyRead(storageKey: string) {
    const storage = this.storage;

    // objectMode: false é obrigatório — no modo objeto (default de Readable.from) o
    // archiver não consome os Buffers e grava entrada de 0 byte.
    return Readable.from(
      (async function* () {
        const source = await storage.openRead(storageKey);
        yield* source;
      })(),
      { objectMode: false },
    );
  }
}

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

@Controller()
export class ZipController {
  constructor(
    private readonly requests: RequestRepository,
    private readonly storage: StorageProvider,
  ) {}

  @Get('requests/:id/zip')
  async requestZip(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const found = await this.requests.documentsForRequestZip(scope, params.id);
    if (!found) throw new NotFound('Solicitação não encontrada.');

    return this.stream(
      zipEntries(found.documents, false),
      zipFileName(found.companyName, found.referenceMonth),
    );
  }

  @Get('periods/:id/zip')
  async periodZip(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const found = await this.requests.documentsForPeriodZip(scope, params.id);
    if (!found) throw new NotFound('Competência não encontrada.');

    return this.stream(
      zipEntries(found.documents, true),
      zipFileName(`competencia ${found.referenceMonth.slice(0, 7)}`, found.referenceMonth),
    );
  }

  /** Preview/baixar avulso no painel do Contador: `inline` para o navegador abrir PDF e
   *  imagem na própria tela — hoje o único caminho até o conteúdo é o zip da empresa
   *  inteira, e o aceite acontece sem ninguém ver o arquivo. */
  @Get('documents/:id/content')
  async documentContent(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
  ) {
    const found = await this.requests.documentForRead(scope, params.id);
    if (!found) throw new NotFound('Documento não encontrado.');

    return new StreamableFile(await this.storage.openRead(found.storageKey), {
      type: found.contentType,
      // encodeURIComponent: nome com acento/aspas quebraria o header (RFC 6266)
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
    });
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

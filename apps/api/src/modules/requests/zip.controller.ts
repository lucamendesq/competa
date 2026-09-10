import { Readable } from 'node:stream';
import { Controller, Get, Logger, Param, StreamableFile } from '@nestjs/common';
import { IdParam } from '@contabilidade/contracts';
// archiver 8 exporta classes, não uma função default
import { ZipArchive } from 'archiver';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { NotFound, ServiceUnavailable } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { servedContentType } from './file-rules.js';
import { RequestRepository } from './request.repository.js';
import { zipEntries, zipFileName, type ZipEntry } from './zip.js';

@Controller()
export class ZipController {
  private readonly logger = new Logger(ZipController.name);

  constructor(
    private readonly requests: RequestRepository,
    private readonly storage: StorageProvider,
  ) {}

  @Get('requests/:id/zip')
  async requestZip(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const found = await this.requests.documentsForRequestZip(scope, params.id);
    if (!found) throw new NotFound('Solicitação não encontrada.');

    return await this.stream(
      zipEntries(found.documents, false),
      zipFileName(found.companyName, found.referenceMonth),
    );
  }

  @Get('periods/:id/zip')
  async periodZip(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const found = await this.requests.documentsForPeriodZip(scope, params.id);
    if (!found) throw new NotFound('Competência não encontrada.');

    return await this.stream(
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

    /* O `content_type` é declarado pelo Responsável no presign, não conferido: devolver o
     * valor cru com `inline` deixaria um HTML enviado como documento executar script na
     * origem da API (e, pelo `blob:` que o painel monta, na origem do front). */
    const { contentType, inline } = servedContentType(found.contentType);

    return new StreamableFile(await this.storage.openRead(found.storageKey), {
      type: contentType,
      // encodeURIComponent: nome com acento/aspas quebraria o header (RFC 6266)
      disposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
    });
  }

  private async stream(entries: ZipEntry[], fileName: string) {
    if (entries.length === 0) {
      throw new NotFound('Nenhum documento para baixar (rejeitados não entram na entrega).');
    }

    /* Conferir os objetos ANTES do primeiro byte. Descobrir no meio do stream que um objeto
     * sumiu é tarde: os headers já saíram com 200 e não há como voltar atrás — o contador
     * baixa um zip a menos e não tem como saber.
     * ponytail: um HEAD por documento; o zip da Competência inteira faz milhares. Trocar
     * por um `sizeBytes` conferido na confirmação se a latência incomodar. */
    const sizes = await Promise.all(
      entries.map((entry) => this.storage.statSize(entry.storageKey)),
    );
    const missing = entries.filter((_, index) => sizes[index] === undefined);

    if (missing.length) {
      this.logger.error(`zip abortado: ${missing.length} objeto(s) fora do storage`);
      throw new ServiceUnavailable(
        'Alguns arquivos não estão disponíveis no armazenamento. A contabilidade foi avisada.',
      );
    }

    // store: os documentos já chegam comprimidos (pdf, xml zipado, imagem) — gastar CPU
    // recomprimindo não paga, e egress do R2 é grátis.
    const archive = new ZipArchive({ store: true });

    for (const entry of entries) {
      archive.append(this.lazyRead(entry.storageKey), { name: entry.path });
    }

    /* sem await: finalize() só termina quando o consumidor drenar a resposta. Mas COM
     * `.catch()`: promise flutuante que rejeita derruba o processo inteiro. */
    archive.finalize().catch((error: unknown) => this.abort(archive, error));

    // o content-type sai daqui, e não de um @Header: com o header fixo na rota, o 404
    // "nenhum documento" saía rotulado como application/zip e o cliente baixava um
    // arquivo quebrado em vez de ver o erro.
    return new StreamableFile(archive, {
      type: 'application/zip',
      disposition: `attachment; filename="${fileName}"`,
    }).setErrorHandler((error, response) => {
      this.abort(archive, error);
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
  }

  /** Falha depois dos headers não vira 200 limpo: destruir o archive corta a saída antes do
   *  diretório central do zip, então o arquivo que chega ao contador NÃO abre — melhor um
   *  download quebrado e visível do que um zip válido com documentos faltando. */
  private abort(archive: ZipArchive, error: unknown) {
    this.logger.error(`zip interrompido no meio do stream: ${String(error)}`);
    if (!archive.destroyed) archive.destroy();
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

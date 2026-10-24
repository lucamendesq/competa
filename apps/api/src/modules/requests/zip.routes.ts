import type { ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { Logger } from '../../lib/logger.js';
import { NodeHttpServerRequest, NodeStream } from '@effect/platform-node';
import { IdParam } from '@competa/contracts';
import { ZipArchive } from 'archiver';
import { Effect, Layer } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { fromRuntime } from '../../effect/runtime.js';
import { storage } from '../../infra/storage/storage.js';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { params, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { ZipAlreadyInFlight, ZipTooLarge } from './errors.js';
import { servedContentType } from './file-rules.js';
import { RequestsRepo } from './request.repo.js';
import { zipEntries, zipFileName, type ZipEntry } from './zip.js';

/** Teto do pacote da competência inteira. */
const MAX_PERIOD_ZIP_ENTRIES = 2000;

const logger = new Logger('ZipController');

/** Serializa downloads do MESMO zip (era o `ZipFlightService`): dois cliques concorrentes
 *  receberiam o mesmo `Readable` — que só pode ser consumido uma vez — e o segundo baixaria
 *  um arquivo truncado. Chave por alvo, não por processo: os ids são UUID. */
const inFlight = new Set<string>();

const abort = (archive: ZipArchive, error: unknown) => {
  logger.error(`zip interrompido no meio do stream: ${String(error)}`);
  if (!archive.destroyed) archive.destroy();
};

const lazyRead = (storageKey: string, archive: ZipArchive) =>
  Readable.from(
    (async function* () {
      try {
        const source = await storage.openRead(storageKey);
        yield* source;
      } catch (error) {
        abort(archive, error);
        throw error;
      }
    })(),
    { objectMode: false },
  );

const streamZip = (entries: ZipEntry[], fileName: string, targetId: string, release: () => void) =>
  Effect.gen(function* () {
    if (entries.length === 0) {
      return yield* Effect.fail(new NotFound('Nenhum documento disponível para baixar.'));
    }

    const request = yield* HttpServerRequest.HttpServerRequest;
    const nodeResponse = NodeHttpServerRequest.toServerResponse(request) as ServerResponse;
    const archive = new ZipArchive({ store: true });

    /* A chave só sai quando o stream fecha de verdade: o handler devolve assim que o
     * arquivo é montado, muito antes do último byte sair. `requests.e2e.spec.ts` prende
     * isso — o 409 concorrente depende de a chave continuar presa durante a transmissão. */
    archive.once('close', release);
    archive.once('error', release);

    nodeResponse.on('close', () => {
      if (!nodeResponse.writableEnded) {
        logger.warn(`Cliente desconectou: abortando zip de ${targetId}`);
        abort(archive, new Error('Client disconnected'));
      }
    });

    for (const entry of entries) {
      archive.append(lazyRead(entry.storageKey, archive), { name: entry.path });
    }

    archive.finalize().catch((error: unknown) => abort(archive, error));

    return HttpServerResponse.stream(NodeStream.fromReadable({ evaluate: () => archive }), {
      contentType: 'application/zip',
      headers: { 'content-disposition': `attachment; filename="${fileName}"` },
    });
  });

/** Pega a chave antes do lookup e a devolve em qualquer falha; no caminho feliz quem a
 *  devolve é o `close` do stream (`streamZip`). */
const withFlight = <E, R>(
  key: string,
  build: (release: () => void) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E | ZipAlreadyInFlight, R> =>
  Effect.suspend(
    (): Effect.Effect<HttpServerResponse.HttpServerResponse, E | ZipAlreadyInFlight, R> => {
      if (inFlight.has(key)) return Effect.fail(new ZipAlreadyInFlight());
      inFlight.add(key);

      const release = () => inFlight.delete(key);
      return build(release).pipe(Effect.tapCause(() => Effect.sync(release)));
    },
  );

const requestZip = route(
  'GET',
  '/requests/:id/zip',
  Effect.gen(function* () {
    const { scope } = yield* FirmContext;
    const { id } = yield* params(IdParam);

    return yield* withFlight(`requests:${id}`, (release) =>
      Effect.gen(function* () {
        const found = yield* fromRuntime(
          RequestsRepo.use((repo) => repo.documentsForRequestZip(scope, id)),
        );
        if (!found) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));

        return yield* streamZip(
          zipEntries(found.documents, false),
          zipFileName(found.companyName, found.referenceMonth),
          id,
          release,
        );
      }),
    );
  }),
  { auth: firmRoute() },
);

/** O gate é ANTES da montagem: um pedido que vai ser recusado não pode gastar uma
 *  conexão de storage nem um slot do voo único. `firmRoute` resolve plano antes do
 *  handler, então id fantasma de plano sem a capability continua levando 402. */
const periodZip = route(
  'GET',
  '/periods/:id/zip',
  Effect.gen(function* () {
    const { scope } = yield* FirmContext;
    const { id } = yield* params(IdParam);

    return yield* withFlight(`periods:${id}`, (release) =>
      Effect.gen(function* () {
        const found = yield* fromRuntime(
          RequestsRepo.use((repo) => repo.documentsForPeriodZip(scope, id)),
        );
        if (!found) return yield* Effect.fail(new NotFound('Competência não encontrada.'));

        /* Competência inteira de um escritório grande é uma requisição de horas segurando
         * conexões de storage. Acima do teto, o caminho é o zip por Empresa. */
        const entries = zipEntries(found.documents, true);
        if (entries.length > MAX_PERIOD_ZIP_ENTRIES) {
          return yield* Effect.fail(new ZipTooLarge(entries.length, MAX_PERIOD_ZIP_ENTRIES));
        }

        return yield* streamZip(
          entries,
          zipFileName(`competencia ${found.referenceMonth.slice(0, 7)}`, found.referenceMonth),
          id,
          release,
        );
      }),
    );
  }),
  { auth: firmRoute({ requires: 'periodZip' }) },
);

/* `StreamableFile` do Nest: `Content-Type` e `Content-Disposition` saem como vieram, sem
 * `Content-Length` (o corpo é um stream). A allowlist de `servedContentType` é a primeira
 * barreira de XSS sobre conteúdo de terceiros — o que não está nela vira octet-stream. */
const documentContent = route(
  'GET',
  '/documents/:id/content',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const found = yield* fromRuntime(RequestsRepo.use((repo) => repo.documentForRead(scope, id)));
      if (!found) return yield* Effect.fail(new NotFound('Documento não encontrado.'));

      const { contentType, inline } = servedContentType(found.contentType);
      const readable = yield* Effect.promise(() => storage.openRead(found.storageKey));

      return HttpServerResponse.stream(NodeStream.fromReadable({ evaluate: () => readable }), {
        contentType,
        headers: {
          'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
        },
      });
    }),
  ),
  { auth: firmRoute() },
);

export const zipRoutes = Layer.mergeAll(requestZip, periodZip, documentContent);

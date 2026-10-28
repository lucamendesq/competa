import type { IncomingMessage } from 'node:http';
import { NodeHttpServerRequest } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerRequest } from 'effect/http';
import env from '../../config/env.js';
import { handler } from '../../http/envelope.js';
import { publicRoute, route } from '../../http/platform.js';
import type { AppError } from '../../lib/app-error.js';
import { LocalStorage } from './local.storage.js';

/** Fora de produção, onde o presign aponta para a própria API. Em produção o upload vai
 *  direto para o R2 e esta rota não existe — registrá-la lá abriria uma escrita em disco
 *  anônima e sem throttle. */
const servesLocalUploads = env.NODE_ENV !== 'production';

const storage = servesLocalUploads ? new LocalStorage() : undefined;

const put = route(
  'PUT',
  '/storage/local/:storageKey',
  handler(
    'PUT',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const nodeRequest = NodeHttpServerRequest.toIncomingMessage(request) as IncomingMessage;
      const params = yield* HttpRouter.params;
      const query = yield* HttpServerRequest.ParsedSearchParams;

      /* Nenhum parser de corpo roda antes desta rota, então o stream chega intacto: um parser
       * global que o drenasse antes gravaria arquivo de 0 byte. */
      const storageKey = params.storageKey ?? '';

      yield* Effect.tryPromise({
        try: () =>
          storage!.write({
            storageKey,
            expiresAt: Number(query.expiresAt),
            sizeBytes: Number(query.sizeBytes),
            signature: typeof query.signature === 'string' ? query.signature : '',
            body: nodeRequest,
          }),
        // `Forbidden`/`PayloadTooLarge` do storage são erros do app, não defeitos
        catch: (error) => error as AppError,
      });

      return { storageKey };
    }),
  ),
  /* Upload de N arquivos bate aqui N vezes em sequência: contar isso como rajada quebraria
   * envio legítimo de lote, e o `short` (30/10s) cortava o 31º arquivo. O limite real está
   * no presign, que autoriza. */
  { auth: publicRoute, throttle: [] },
);

export const localStorageRoutes = servesLocalUploads ? Layer.mergeAll(put) : Layer.empty;

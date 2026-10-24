import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { buildInfo } from '../build-info.js';
import { ServiceUnavailable } from '../lib/app-error.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { contactsRoutes } from '../modules/contacts/contacts.routes.js';
import { uploadRoutes } from '../modules/requests/upload.routes.js';
import { handler } from './envelope.js';
import { nestFallback, type NodeRequestListener } from './nest-bridge.js';
import { ThrottleStore, TrustProxy, route } from './platform.js';
import { GLOBAL_BUCKETS, makeThrottleStore } from './throttle.js';

/** O que um balanceador/orquestrador consulta antes de mandar tráfego. Toca o banco de
 *  propósito: processo vivo com pool morto responde 200 em qualquer healthcheck que só
 *  olhe o HTTP, e o deploy segue para uma instância que não atende ninguém. */
const healthRoute = (ping: () => Promise<void>) =>
  route(
    'GET',
    '/health',
    handler(
      'GET',
      Effect.tryPromise({
        try: ping,
        catch: () => new ServiceUnavailable('Banco indisponível.'),
      }).pipe(Effect.as({ status: 'ok' as const, ...buildInfo })),
    ),
    /* `@SkipThrottle()` nu pula SÓ o balde `default`: a sonda bate a cada poucos segundos e
     * o balde de 120/60s a derrubaria, mas o `short` continua valendo. */
    { throttle: GLOBAL_BUCKETS.filter((bucket) => bucket.name !== 'default') },
  );

export const serverLayer = (options: {
  readonly port: number;
  readonly trustProxy: boolean;
  readonly ping: () => Promise<void>;
  readonly fallback: NodeRequestListener;
}) =>
  /* `nestFallback` é o curinga `'*' '/*'` e fica por último na leitura, mas find-my-way
   * prioriza estático > param > curinga: a ordem do merge não decide nada. */
  HttpRouter.serve(
    Layer.mergeAll(
      healthRoute(options.ping),
      authRoutes,
      contactsRoutes,
      uploadRoutes,
      nestFallback(options.fallback),
    ),
    {
      // pino-http é chamado pela pilha de plataforma (rotas Effect) e pelo Nest (catch-all)
      disableLogger: true,
      disableListenLog: true,
    },
  ).pipe(
    Layer.provideMerge(NodeHttpServer.layer(createServer, { port: options.port })),
    Layer.provideMerge(Layer.succeed(TrustProxy)(options.trustProxy)),
    Layer.provideMerge(Layer.sync(ThrottleStore)(() => makeThrottleStore())),
  );

import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { ByteSize, Effect, Layer } from 'effect';
import { HttpIncomingMessage, HttpRouter } from 'effect/http';
import { buildInfo } from '../build-info.js';
import type { Db } from '../infra/database/effect.js';
import { localStorageRoutes } from '../infra/storage/local-storage.routes.js';
import { ServiceUnavailable } from '../lib/app-error.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { signupRoutes } from '../modules/auth/signup.routes.js';
import { teamRoutes } from '../modules/auth/team.routes.js';
import { asaasWebhookRoutes } from '../modules/billing/asaas-webhook.routes.js';
import { billingRoutes } from '../modules/billing/billing.routes.js';
import { checklistsRoutes } from '../modules/checklists/checklists.routes.js';
import { companiesRoutes } from '../modules/companies/companies.routes.js';
import { accessRecoveryRoutes } from '../modules/contacts/access-recovery.routes.js';
import { contactAccessRoutes } from '../modules/contacts/contact-access.routes.js';
import { contactsRoutes } from '../modules/contacts/contacts.routes.js';
import { messagesRoutes } from '../modules/messaging/messages.routes.js';
import { pushRoutes } from '../modules/messaging/push.routes.js';
import { periodsRoutes } from '../modules/periods/periods.routes.js';
import { requestsRoutes } from '../modules/requests/requests.routes.js';
import { reviewRoutes } from '../modules/requests/review.routes.js';
import { uploadRoutes } from '../modules/requests/upload.routes.js';
import { zipRoutes } from '../modules/requests/zip.routes.js';
import { whatsappSettingsRoutes } from '../modules/whatsapp/whatsapp-settings.routes.js';
import { whatsappWebhookRoutes } from '../modules/whatsapp/whatsapp-webhook.routes.js';
import { authMountRoutes } from './auth-mount.js';
import { handler } from './envelope.js';
import { fallbackRoutes } from './fallback.js';
import { ThrottleStore, TrustProxy, publicRoute, route } from './platform.js';
import { GLOBAL_BUCKETS, makeThrottleStore } from './throttle.js';

/** O que um balanceador/orquestrador consulta antes de mandar tráfego. Toca o banco de
 *  propósito: processo vivo com pool morto responde 200 em qualquer healthcheck que só
 *  olhe o HTTP, e o deploy segue para uma instância que não atende ninguém. */
const healthRoute = (ping: Effect.Effect<unknown, unknown, Db>) =>
  route(
    'GET',
    '/health',
    handler(
      'GET',
      ping.pipe(
        /* `catchCause`, e não `catch`: a sonda responde 503 para QUALQUER causa, defeito
         * incluído. */
        Effect.catchCause(() => Effect.fail(new ServiceUnavailable('Banco indisponível.'))),
        Effect.as({ status: 'ok' as const, ...buildInfo }),
      ),
    ),
    /* Sem o balde `default`: a sonda bate a cada poucos segundos e o de 120/60s a
     * derrubaria. O `short` continua valendo. */
    { auth: publicRoute, throttle: GLOBAL_BUCKETS.filter((bucket) => bucket.name !== 'default') },
  );

/** O servidor HTTP com todas as rotas. Exige a árvore de serviços do app (`AppServices`):
 *  quem monta decide o `Db` por baixo — o real no app, a trava sem banco nos testes. */
export const serverLayer = (options: {
  readonly port: number;
  readonly trustProxy: boolean;
  readonly ping: Effect.Effect<unknown, unknown, Db>;
}) =>
  /* `fallbackRoutes` é o curinga `'*' '/*'` e fica por último na leitura, mas find-my-way
   * prioriza estático > param > curinga: a ordem do merge não decide nada. */
  HttpRouter.serve(
    Layer.mergeAll(
      healthRoute(options.ping),
      localStorageRoutes,
      pushRoutes,
      asaasWebhookRoutes,
      whatsappWebhookRoutes,
      whatsappSettingsRoutes,
      periodsRoutes,
      checklistsRoutes,
      companiesRoutes,
      authRoutes,
      signupRoutes,
      teamRoutes,
      billingRoutes,
      contactsRoutes,
      accessRecoveryRoutes,
      contactAccessRoutes,
      uploadRoutes,
      requestsRoutes,
      reviewRoutes,
      messagesRoutes,
      zipRoutes,
      authMountRoutes,
      fallbackRoutes,
    ),
    {
      // o log de requisição é o pino-http, chamado pela pilha de plataforma
      disableLogger: true,
      disableListenLog: true,
      /* O default do find-my-way é 100 caracteres por parâmetro, e
       * `PUT /storage/local/:storageKey` recebe a chave inteira percent-encoded
       * (`firm/<uuid>/period/<aaaa-mm>/request/<uuid>/<uuid>.ext`, ~155 caracteres): acima
       * do limite a rota não casa e vira 404. */
      routerConfig: { maxParamLength: 1024 },
    },
  ).pipe(
    Layer.provideMerge(NodeHttpServer.layer(createServer, { port: options.port })),
    Layer.provideMerge(Layer.succeed(TrustProxy)(options.trustProxy)),
    Layer.provideMerge(Layer.sync(ThrottleStore)(() => makeThrottleStore())),
    /* Teto de 2 MiB no corpo — o único freio contra OOM. Não alcança `/api/auth/*` (lá o
     * corpo é stream) nem `PUT /storage/local/:key` (que lê o `IncomingMessage` cru). */
    Layer.provideMerge(Layer.succeed(HttpIncomingMessage.MaxBodySize)(ByteSize.mebibytes(2))),
  );

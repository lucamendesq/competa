import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import type { EventEmitter2 } from '../lib/event-emitter.js';
import { ByteSize, Effect, Layer } from 'effect';
import { HttpIncomingMessage, HttpRouter } from 'effect/http';
import { buildInfo } from '../build-info.js';
import { appServices } from '../effect/runtime.js';
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
import { messagesRoutes, type RunReminders } from '../modules/messaging/messages.routes.js';
import { pushRoutes } from '../modules/messaging/push.routes.js';
import { periodsRoutes } from '../modules/periods/periods.routes.js';
import { requestsRoutes } from '../modules/requests/requests.routes.js';
import { reviewRoutes, type ScanDeadlines } from '../modules/requests/review.routes.js';
import { uploadRoutes } from '../modules/requests/upload.routes.js';
import { zipRoutes } from '../modules/requests/zip.routes.js';
import { whatsappSettingsRoutes } from '../modules/whatsapp/whatsapp-settings.routes.js';
import { whatsappWebhookRoutes } from '../modules/whatsapp/whatsapp-webhook.routes.js';
import { authMountRoutes } from './auth-mount.js';
import { handler } from './envelope.js';
import { fallbackRoutes } from './fallback.js';
import { ThrottleStore, TrustProxy, route } from './platform.js';
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
        /* `catchCause`, e não `catch`: a sonda respondia 503 para QUALQUER causa, porque o
         * `tryPromise` que vivia aqui recebia defeito e falha pela mesma rejeição. */
        Effect.catchCause(() => Effect.fail(new ServiceUnavailable('Banco indisponível.'))),
        Effect.as({ status: 'ok' as const, ...buildInfo }),
      ),
    ),
    /* `@SkipThrottle()` nu pula SÓ o balde `default`: a sonda bate a cada poucos segundos e
     * o balde de 120/60s a derrubaria, mas o `short` continua valendo. */
    { throttle: GLOBAL_BUCKETS.filter((bucket) => bucket.name !== 'default') },
  );

export const serverLayer = (options: {
  readonly port: number;
  readonly trustProxy: boolean;
  readonly ping: Effect.Effect<unknown, unknown, Db>;
  /** A MESMA instância do container Nest: os listeners de messaging estão registrados
   *  nela, e uma cópia engoliria todo evento emitido por rota migrada. */
  readonly events: EventEmitter2;
  /** As varreduras com escopo de firma das rotas HTTP; o agendamento vive em `crons.ts`. */
  readonly scanDeadlines: ScanDeadlines;
  readonly runReminders: RunReminders;
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
      periodsRoutes(options.events),
      checklistsRoutes,
      companiesRoutes(options.events),
      authRoutes,
      signupRoutes,
      teamRoutes(options.events),
      billingRoutes,
      contactsRoutes,
      accessRecoveryRoutes(options.events),
      contactAccessRoutes,
      uploadRoutes,
      requestsRoutes(options.events),
      reviewRoutes(options.events, options.scanDeadlines),
      messagesRoutes(options.runReminders),
      zipRoutes,
      authMountRoutes,
      fallbackRoutes,
    ),
    {
      // o log de requisição é o pino-http, chamado pela pilha de plataforma
      disableLogger: true,
      disableListenLog: true,
      /* O default do find-my-way é 100 caracteres por parâmetro, e o Express não tinha
       * limite nenhum: `PUT /storage/local/:storageKey` recebe a chave inteira
       * percent-encoded (`firm/<uuid>/period/<aaaa-mm>/request/<uuid>/<uuid>.ext`, ~155
       * caracteres) e só não 404ava porque a ponte para o Nest pegava o resto. */
      routerConfig: { maxParamLength: 1024 },
    },
  ).pipe(
    Layer.provideMerge(NodeHttpServer.layer(createServer, { port: options.port })),
    Layer.provideMerge(Layer.succeed(TrustProxy)(options.trustProxy)),
    Layer.provideMerge(Layer.sync(ThrottleStore)(() => makeThrottleStore())),
    /* `bodyParser.json.limit: '2mb'` do `BetterAuthModule.forRoot` — o único freio contra
     * OOM. `'2mb'` do pacote `bytes` é base 1024. Não alcança `/api/auth/*` (lá o corpo é
     * stream) nem `PUT /storage/local/:key` (que lê o `IncomingMessage` cru), exatamente
     * como o `SkipBodyParsingMiddleware` não alcançava. */
    Layer.provideMerge(Layer.succeed(HttpIncomingMessage.MaxBodySize)(ByteSize.mebibytes(2))),
    // o `serve` converte o que a rota marca como `Requires` em requisito comum da layer
    Layer.provide(appServices),
  );

import type { IncomingMessage } from 'node:http';
import { Logger } from '../../lib/logger.js';
import { NodeHttpServerRequest } from '@effect/platform-node';
import * as Sentry from '@sentry/node';
import { planAllows, type PlanCapability } from '@competa/contracts';
import { isPast } from 'date-fns';
import * as z from 'zod';
import { Context, Effect } from 'effect';
import { HttpRouter, HttpServerRequest, type HttpServerError } from 'effect/http';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import type { DbUnavailable } from '../../infra/database/error.js';
import type { AppContext } from '../../effect/runtime.js';
import {
  AppError,
  Forbidden,
  NotFound,
  PaymentRequired,
  Unauthenticated,
  ValidationError,
} from '../../lib/app-error.js';
import { hashToken } from '../../lib/token.js';
import { AccountantsRepo } from '../../modules/auth/accountant.repo.js';
import { InvalidUploadLink, PlanCapabilityRequired } from '../../modules/auth/errors.js';
import { toContactScope, toFirmScope, toUploadScope } from '../../modules/auth/scope.js';
import { ContactsRepo } from '../../modules/contacts/contact.repo.js';
import { UploadLinksRepo } from '../../modules/requests/upload-link.repo.js';
import { ContactContext, FirmContext, SessionContext, UploadContext } from '../context.js';
import type { RouteProfile } from '../platform.js';
import { GLOBAL_BUCKETS, UPLOAD_PRESIGN_BUCKET, type Bucket } from '../throttle.js';

/* ÚNICO lugar onde os escopos branded nascem. A exceção de lint vive em `eslint.config.mjs`,
 * não numa diretiva no arquivo. */

const UUID = z.uuid();

type Resolved<Value> = Effect.Effect<
  Value,
  AppError | HttpServerError.HttpServerError | DbUnavailable,
  HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext | AppContext
>;

/** Um perfil = resolver o contexto + entregá-lo ao handler. A ordem throttle → perfil está
 *  no corpo de `platform` (`platform.ts`), não num `Middleware.combine`: `A.combine(B)`
 *  roda B primeiro, e descobrir isso às 3 da manhã sai caro. */
const profileOf = <Identifier, Value>(
  tag: Context.Key<Identifier, Value>,
  resolve: Resolved<Value>,
  throttle?: readonly Bucket[],
): RouteProfile<Identifier> => ({
  throttle,
  apply: (inner) => Effect.flatMap(resolve, (value) => Effect.provideService(inner, tag, value)),
});

const auth = new BetterAuthAdapter();

const nodeRequest = (request: HttpServerRequest.HttpServerRequest) =>
  NodeHttpServerRequest.toIncomingMessage(request) as IncomingMessage;

const currentSession = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const session = yield* Effect.promise(() => auth.getSession(nodeRequest(request).headers));
  if (!session) return yield* Effect.fail(new Unauthenticated());

  return session;
});

const findAccountant = (authUserId: string) =>
  AccountantsRepo.use((repo) => repo.findByAuthUserId(authUserId));

const planLogger = new Logger('PlanGuard');

/** A negação é logada de propósito: é a matéria-prima da revisão do segundo eixo (D18). */
const logPlanDenial = (
  request: HttpServerRequest.HttpServerRequest,
  route: HttpRouter.RouteContext['Service'],
  context: { readonly scope: string; readonly planName: string },
  capability: PlanCapability,
) =>
  Effect.sync(() => {
    const denied =
      `402 PLAN_CAPABILITY_REQUIRED firm=${context.scope} capability=${capability} ` +
      `plan=${context.planName} route=${request.method} ${route.route.path}`;

    planLogger.warn(denied);
    Sentry.captureMessage(denied, 'warning');
  });

/** O gate que só o handler sabe decidir (depende do corpo, como os knobs de lembrete do
 *  PATCH da firma) nega pelo mesmo caminho do `firmRoute({ requires })`: logado e com o 402
 *  de capability, para a revisão do segundo eixo não perder metade das negações. */
export const requirePlanCapability = (capability: PlanCapability) =>
  Effect.gen(function* () {
    const context = yield* FirmContext;
    if (planAllows(context.planName, capability)) return;

    yield* logPlanDenial(
      yield* HttpServerRequest.HttpServerRequest,
      yield* HttpRouter.RouteContext,
      context,
      capability,
    );
    return yield* Effect.fail(new PlanCapabilityRequired(capability));
  });

const resolveFirm = (
  requires: PlanCapability | undefined,
  billing: boolean,
): Resolved<FirmContext['Service']> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const session = yield* currentSession;

    const row = yield* findAccountant(session.user.id);
    if (!row)
      return yield* Effect.fail(new Forbidden('Esta conta não pertence a uma Contabilidade.'));

    /* Defaulting Rule (COM-8): leitura passa, escrita não. A rota de cobrança é a exceção:
     * é por ela que a firma bloqueada regulariza — bloqueá-la trancava o cliente do lado de
     * fora com o boleto na mão. */
    if (request.method !== 'GET' && request.method !== 'HEAD' && !billing) {
      /* Cancelada segue valendo até o fim do período já pago: ninguém perde o que pagou por
       * ter cancelado cedo. Sem período (trial cancelado) bloqueia na hora. */
      const canceledAndLapsed =
        row.subscriptionStatus === 'CANCELED' &&
        (row.currentPeriodEnd === null || isPast(row.currentPeriodEnd));
      const overdue = row.subscriptionStatus === 'OVERDUE' || canceledAndLapsed;
      const trialExpired =
        row.subscriptionStatus === 'trialing' &&
        row.trialEndsAt !== null &&
        isPast(row.trialEndsAt);

      if (overdue || trialExpired) return yield* Effect.fail(new PaymentRequired());
    }

    const context = {
      scope: toFirmScope(row.accountingFirmId),
      accountantId: row.id,
      /* O gate de plano lê daqui: o plano veio na mesma consulta da sessão, então a
       * capability não custa uma query a mais por request. */
      planName: row.subscriptionPlanName ?? 'trial',
      session,
    };

    // `customProps` do pino (`src/config/logger.ts`) lê estes dois campos do IncomingMessage
    Object.assign(nodeRequest(request), {
      firmScope: context.scope,
      accountantId: context.accountantId,
    });

    if (requires !== undefined && !planAllows(context.planName, requires)) {
      yield* logPlanDenial(request, yield* HttpRouter.RouteContext, context, requires);
      return yield* Effect.fail(new PlanCapabilityRequired(requires));
    }

    return context;
  });

/** Sessão de Responsável → `ContactScope`. Sessão de Contador NÃO passa: `contact.auth_user_id`
 *  é o único vínculo aceito. Empresa inativa fica de fora; sem nenhuma ativa, o acesso cai. */
const resolveContact: Resolved<ContactContext['Service']> = Effect.gen(function* () {
  const session = yield* currentSession;

  const rows = yield* ContactsRepo.use((repo) => repo.findMembershipsByAuthUser(session.user.id));
  if (!rows.length) {
    return yield* Effect.fail(new Forbidden('Esta conta não é de um Responsável de Empresa.'));
  }

  const memberships = rows
    .filter((row) => row.active)
    .map(({ contactId, companyId }) => ({ contactId, companyId }));

  if (!memberships.length) {
    return yield* Effect.fail(new Forbidden('Esta empresa está inativa na contabilidade.'));
  }

  return { scope: toContactScope(memberships), session };
});

/** Upload logado do Responsável: mesmo `UploadScope` do fluxo por link, a partir da sessão. */
const resolveContactUpload: Resolved<UploadContext['Service']> = Effect.gen(function* () {
  const session = yield* currentSession;
  const request = yield* HttpServerRequest.HttpServerRequest;

  /* O vínculo de Responsável é resolvido ANTES de olhar o corpo: quem não é Responsável
   * leva 403 mesmo mandando corpo vazio ou `requestId` lixo. Inverter a ordem trocaria
   * esse 403 por um 422. */
  yield* resolveContact;

  /* O perfil precisa do `requestId` antes do handler, então ele mesmo valida.
   * `request.json` é memoizado, e o handler relê o mesmo corpo depois.
   *
   * Corpo ausente ou ilegível vira `{}` e não erro: a resposta é 422 pelo `requestId`
   * faltando. Deixar o `RequestParseError` subir trocaria esse 422 por um 400. */
  const raw = yield* request.json.pipe(Effect.orElseSucceed(() => ({})));
  const requestId = (raw as { requestId?: unknown } | null)?.requestId;
  if (typeof requestId !== 'string') {
    return yield* Effect.fail(new ValidationError('Informe a Solicitação (requestId) do envio.'));
  }

  /* O formato é conferido AQUI porque a consulta abaixo usa o id direto: id fora do formato
   * uuid estourava no Postgres (`invalid input syntax for type uuid`) e virava 500, quando é
   * erro do cliente. */
  if (!UUID.safeParse(requestId).success) {
    return yield* Effect.fail(new ValidationError('Solicitação (requestId) inválida.'));
  }

  const owned = yield* ContactsRepo.use((repo) =>
    repo.findUploadOwnership(session.user.id, requestId),
  );

  /* `resolveContact` já garantiu que a conta é de um Responsável com Empresa ativa, então
   * aqui "não achou" só pode ser Solicitação de outra Empresa. */
  if (!owned) {
    return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));
  }

  if (!owned.active) {
    return yield* Effect.fail(new Forbidden('Esta empresa está inativa na contabilidade.'));
  }

  return { scope: toUploadScope(owned.requestId, owned.contactId), session };
});

/** Mensagem única para link inexistente, expirado ou revogado (`InvalidUploadLink`). */
const resolveUploadToken: Resolved<UploadContext['Service']> = Effect.gen(function* () {
  const token = (yield* HttpRouter.params).token;
  if (!token) return yield* Effect.fail(new InvalidUploadLink());

  const link = yield* UploadLinksRepo.use((repo) => repo.findByTokenHash(hashToken(token)));
  if (!link || link.revoked || link.expiresAt.getTime() <= Date.now()) {
    return yield* Effect.fail(new InvalidUploadLink());
  }

  return { scope: toUploadScope(link.requestId, link.contactId) };
});

/** Sessão → `FirmScope`, mais o gate de plano de `requires`. `billing` dispensa a régua de
 *  inadimplência: só para as rotas por onde a firma bloqueada paga ou cancela. */
export const firmRoute = (options?: {
  readonly requires?: PlanCapability;
  readonly billing?: boolean;
}): RouteProfile<FirmContext> =>
  profileOf(FirmContext, resolveFirm(options?.requires, options?.billing === true));

export const contactRoute: RouteProfile<ContactContext> = profileOf(ContactContext, resolveContact);

export const contactUploadRoute: RouteProfile<UploadContext> = profileOf(
  UploadContext,
  resolveContactUpload,
);

/** `uploadThrottle` acrescenta o balde por `ip:token` POR CIMA dos globais. */
export const uploadTokenRoute = (options?: {
  readonly uploadThrottle?: boolean;
}): RouteProfile<UploadContext> =>
  profileOf(
    UploadContext,
    resolveUploadToken,
    options?.uploadThrottle === true ? [...GLOBAL_BUCKETS, UPLOAD_PRESIGN_BUCKET] : GLOBAL_BUCKETS,
  );

export const uploadPresignRoute: RouteProfile<UploadContext> = profileOf(
  UploadContext,
  resolveUploadToken,
  [UPLOAD_PRESIGN_BUCKET],
);

/** Qualquer sessão viva serve, sem exigir vínculo com Contabilidade. */
export const sessionRoute: RouteProfile<SessionContext> = profileOf(SessionContext, currentSession);

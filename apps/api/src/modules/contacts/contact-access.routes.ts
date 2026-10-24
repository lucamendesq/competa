import { randomBytes } from 'node:crypto';
import {
  AcceptContactInviteBody,
  ActivateContactAccessBody,
  InviteTokenParam,
  PushSubscriptionBody,
} from '@competa/contracts';
import { APIError } from 'better-auth/api';
import { Effect, Layer } from 'effect';
import { fromRuntime, withDb } from '../../effect/runtime.js';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { UploadContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { uploadTokenRoute } from '../../http/middleware/auth.js';
import { body, params, route } from '../../http/platform.js';
import { throttleDefault } from '../../http/throttle.js';
import { NotFound } from '../../lib/app-error.js';
import { isFailure } from '../../lib/either.js';
import { EmailAlreadyRegistered, InviteTargetUnsupported } from '../auth/errors.js';
import { InviteRepository } from '../auth/invite.repository.js';
import { MessagesRepo } from '../messaging/message.repo.js';
import { UploadLinksRepo } from '../requests/upload-link.repo.js';
import { ContactsRepo } from './contact.repo.js';
import { AccessAlreadyExists } from './errors.js';

const auth = new BetterAuthAdapter();

/* Limite apertado: é rota pública que cria usuário. */
const SIGNUP_THROTTLE = throttleDefault(5, 60_000);

const isDuplicateEmail = (error: unknown) =>
  error instanceof APIError && error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

const activate = route(
  'POST',
  '/upload/:token/access',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* UploadContext;
      const input = yield* body(ActivateContactAccessBody);

      const owner = yield* fromRuntime(UploadLinksRepo.use((repo) => repo.findContact(scope)));
      if (!owner) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));
      if (owner.authUserId) return yield* Effect.fail(new AccessAlreadyExists());

      /* Email já tem conta de Contador (ou conta sem vínculo de contato) → recusar: o
       * vínculo entregaria a conta dela a quem controla o Link (AUTHZ-1). O front manda o
       * dono entrar em /minha-area/acesso. Conta contact-only passa: o vínculo só ADICIONA
       * esta Empresa ao mesmo Responsável (multi-empresa). */
      const existing = yield* fromRuntime(
        ContactsRepo.use((repo) => repo.userByEmail(owner.email)),
      );
      if (existing && (existing.isAccountant || !existing.isContact)) {
        return yield* Effect.fail(new EmailAlreadyRegistered());
      }

      const name = input.name?.trim() || owner.name;

      /* A conta nasce sem senha utilizável: o acesso só se completa pelo magic link que vai
       * para a caixa do Responsável. Devolver a sessão aqui tornaria o Link de Upload — que
       * circula por email encaminhado, histórico e log de proxy — equivalente à senha,
       * dando a quem o tivesse o acervo inteiro da Empresa por `/my/documents/:id/content`. */
      const hasProvidedPassword = Boolean(input.password);
      const password = input.password || randomBytes(32).toString('base64url');

      let userId = existing?.id;
      if (!userId) {
        const created = yield* Effect.promise(() =>
          auth.signUpEmail({ name, email: owner.email, password }),
        );
        if (isFailure(created)) {
          if (isDuplicateEmail(created.error)) {
            return yield* Effect.fail(new EmailAlreadyRegistered());
          }
          return yield* Effect.die(created.error);
        }

        userId = created.value.userId;
        yield* fromRuntime(
          ContactsRepo.use((repo) => repo.markUserEmailVerified(created.value.userId)),
        );
      }

      const linked = userId;
      yield* fromRuntime(ContactsRepo.use((repo) => repo.linkAuthUser(owner.id, linked)));
      // a tela informa que ativar implica no aceite dos Termos/Privacidade
      yield* fromRuntime(ContactsRepo.use((repo) => repo.markTermsAccepted(linked)));

      if (!hasProvidedPassword) {
        yield* Effect.promise(() => auth.sendSignInLink(owner.email));
      }

      return {
        email: owner.email,
        name,
        nextStep: hasProvidedPassword ? ('password_set' as const) : ('check_email' as const),
      };
    }),
  ),
  { auth: uploadTokenRoute(), throttle: SIGNUP_THROTTLE },
);

const subscribe = route(
  'POST',
  '/upload/:token/push',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* UploadContext;
      const input = yield* body(PushSubscriptionBody);

      return yield* fromRuntime(
        MessagesRepo.use((repo) => repo.savePushSubscription(scope, input)),
      );
    }),
  ),
  { auth: uploadTokenRoute() },
);

const acceptInvite = route(
  'POST',
  '/invites/:token/contact-account',
  handler(
    'POST',
    Effect.gen(function* () {
      const token = yield* params(InviteTokenParam);
      const input = yield* body(AcceptContactInviteBody);

      const found = yield* withDb((db) => new InviteRepository(db).findUsable(token.token));
      const { companyId } = found;
      if (!companyId) return yield* Effect.fail(new InviteTargetUnsupported());

      const owner = yield* fromRuntime(
        ContactsRepo.use((repo) => repo.findByEmailInCompany(companyId, found.email)),
      );
      if (!owner) {
        return yield* Effect.fail(new NotFound('Responsável não encontrado nesta Empresa.'));
      }
      if (owner.authUserId) return yield* Effect.fail(new AccessAlreadyExists());

      /* Recusa ANTES de queimar o convite: é a falha comum, e queimá-la deixaria o dono do
       * email sem convite e sem conta. */
      const taken = yield* fromRuntime(ContactsRepo.use((repo) => repo.userByEmail(owner.email)));
      if (taken) return yield* Effect.fail(new EmailAlreadyRegistered());

      /* Claim atômico (`isNull(acceptedAt)` no WHERE) antes de criar a conta: deixar para
       * depois fazia o uso único depender de o signUp detectar email duplicado. */
      yield* withDb((db) => new InviteRepository(db).markAccepted(found.id));

      const name = input.name?.trim() || owner.name;
      const signUp = yield* Effect.promise(() =>
        auth.signUpEmail({ name, email: owner.email, password: input.password }),
      );

      if (isFailure(signUp)) {
        if (isDuplicateEmail(signUp.error)) {
          return yield* Effect.fail(new EmailAlreadyRegistered());
        }
        return yield* Effect.die(signUp.error);
      }

      yield* fromRuntime(
        ContactsRepo.use((repo) => repo.markUserEmailVerified(signUp.value.userId)),
      );
      yield* fromRuntime(
        ContactsRepo.use((repo) => repo.linkAuthUser(owner.id, signUp.value.userId)),
      );

      /* O front entra em seguida com o mesmo email e senha: a sessão não sai daqui para não
       * nascer de um link que circula por email. Da tela, é um passo só. */
      return { email: owner.email, name, nextStep: 'sign_in' as const };
    }),
  ),
  { throttle: SIGNUP_THROTTLE },
);

export const contactAccessRoutes = Layer.mergeAll(activate, subscribe, acceptInvite);

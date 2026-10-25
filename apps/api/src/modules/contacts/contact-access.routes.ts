import { randomBytes } from 'node:crypto';
import {
  AcceptContactInviteBody,
  ActivateContactAccessBody,
  InviteTokenParam,
  PushSubscriptionBody,
} from '@competa/contracts';
import { APIError } from 'better-auth/api';
import { Effect, Layer } from 'effect';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { UploadContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { uploadTokenRoute } from '../../http/middleware/auth.js';
import { body, params, route } from '../../http/platform.js';
import { throttleDefault } from '../../http/throttle.js';
import { NotFound } from '../../lib/app-error.js';
import { isFailure } from '../../lib/either.js';
import { EmailAlreadyRegistered, InviteTargetUnsupported } from '../auth/errors.js';
import { InvitesRepo } from '../auth/invite.repo.js';
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

      const owner = yield* UploadLinksRepo.use((repo) => repo.findContact(scope));
      if (!owner) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));
      if (owner.authUserId) return yield* Effect.fail(new AccessAlreadyExists());

      /* Email já tem conta de Contador (ou conta sem vínculo de contato) → recusar: o
       * vínculo entregaria a conta dela a quem controla o Link (AUTHZ-1). O front manda o
       * dono entrar em /minha-area/acesso. Conta contact-only passa: o vínculo só ADICIONA
       * esta Empresa ao mesmo Responsável (multi-empresa). */
      const existing = yield* ContactsRepo.use((repo) => repo.userByEmail(owner.email));
      if (existing && (existing.isAccountant || !existing.isContact)) {
        return yield* Effect.fail(new EmailAlreadyRegistered());
      }

      const name = input.name?.trim() || owner.name;

      /* A conta nasce sem credencial utilizável: o acesso só se completa pelo magic link que
       * vai para a caixa do Responsável. O Link de Upload circula por email encaminhado,
       * histórico e log de proxy — aceitar senha aqui o tornaria equivalente à senha, dando a
       * quem o tivesse o acervo inteiro da Empresa por `/my/documents/:id/content`.
       *
       * O `signUpEmail` do better-auth exige uma senha, então ela nasce aleatória e a linha de
       * credencial é apagada em seguida. Isso também destrava o `POST /my/password`, que
       * recusa trocar senha existente (`PASSWORD_ALREADY_SET`) mas sabe criar a primeira. */
      let userId = existing?.id;
      if (!userId) {
        const created = yield* Effect.promise(() =>
          auth.signUpEmail({
            name,
            email: owner.email,
            password: randomBytes(32).toString('base64url'),
          }),
        );
        if (isFailure(created)) {
          if (isDuplicateEmail(created.error)) {
            return yield* Effect.fail(new EmailAlreadyRegistered());
          }
          return yield* Effect.die(created.error);
        }

        userId = created.value.userId;
        yield* ContactsRepo.use((repo) => repo.dropCredential(created.value.userId));
      }

      const linked = userId;
      yield* ContactsRepo.use((repo) => repo.linkAuthUser(owner.id, linked));
      // a tela informa que ativar implica no aceite dos Termos/Privacidade
      yield* ContactsRepo.use((repo) => repo.markTermsAccepted(linked));

      /* Quem marca `emailVerified` é o magic link (o better-auth promove a conta não provada
       * ao consumir o token). Marcá-lo aqui seria afirmar, a partir de um link encaminhável,
       * um controle de caixa que ninguém provou. */
      yield* Effect.promise(() => auth.sendSignInLink(owner.email));

      return { email: owner.email, name, nextStep: 'check_email' as const };
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

      return yield* MessagesRepo.use((repo) => repo.savePushSubscription(scope, input));
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

      const found = yield* InvitesRepo.use((repo) => repo.findUsable(token.token));
      const { companyId } = found;
      if (!companyId) return yield* Effect.fail(new InviteTargetUnsupported());

      const owner = yield* ContactsRepo.use((repo) =>
        repo.findByEmailInCompany(companyId, found.email),
      );
      if (!owner) {
        return yield* Effect.fail(new NotFound('Responsável não encontrado nesta Empresa.'));
      }
      if (owner.authUserId) return yield* Effect.fail(new AccessAlreadyExists());

      /* Recusa ANTES de queimar o convite: é a falha comum, e queimá-la deixaria o dono do
       * email sem convite e sem conta. */
      const taken = yield* ContactsRepo.use((repo) => repo.userByEmail(owner.email));
      if (taken) return yield* Effect.fail(new EmailAlreadyRegistered());

      /* Claim atômico (`isNull(acceptedAt)` no WHERE) antes de criar a conta: deixar para
       * depois fazia o uso único depender de o signUp detectar email duplicado. */
      yield* InvitesRepo.use((repo) => repo.markAccepted(found.id));

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

      yield* ContactsRepo.use((repo) => repo.markUserEmailVerified(signUp.value.userId));
      yield* ContactsRepo.use((repo) => repo.linkAuthUser(owner.id, signUp.value.userId));

      /* O front entra em seguida com o mesmo email e senha: a sessão não sai daqui para não
       * nascer de um link que circula por email. Da tela, é um passo só. */
      return { email: owner.email, name, nextStep: 'sign_in' as const };
    }),
  ),
  { throttle: SIGNUP_THROTTLE },
);

export const contactAccessRoutes = Layer.mergeAll(activate, subscribe, acceptInvite);

import type { ServerResponse } from 'node:http';
import { Logger } from '../../lib/logger.js';
import { NodeHttpServerRequest } from '@effect/platform-node';
import { RegisterFirmBody } from '@competa/contracts';
import { APIError } from 'better-auth/api';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { squashError } from '../../infra/database/error.js';
import { handler } from '../../http/envelope.js';
import { body, publicRoute, route } from '../../http/platform.js';
import { isFailure } from '../../lib/either.js';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { AccountantsRepo } from './accountant.repo.js';
import { SignupRejected } from './errors.js';

const logger = new Logger('PublicSignupController');
const auth = new BetterAuthAdapter();

const register = Effect.gen(function* () {
  const input = yield* body(RegisterFirmBody);

  const taken = yield* AccountantsRepo.use((repo) => repo.userExistsByEmail(input.email));
  if (taken) return yield* Effect.fail(new SignupRejected());

  const created = yield* Effect.promise(() =>
    auth.signUpEmail(
      { name: input.userName, email: input.email, password: input.password },
      new Headers(),
    ),
  );

  if (isFailure(created)) {
    logger.error('Falha ao criar conta no Better Auth', created.error);

    const isDuplicateEmail =
      created.error instanceof APIError &&
      created.error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

    if (!isDuplicateEmail) return yield* Effect.die(created.error);

    return yield* Effect.fail(new SignupRejected());
  }

  const { userId, setCookie } = created.value;

  yield* AccountantsRepo.use((accountants) =>
    accountants.provisionFirm({ authUserId: userId, firmName: input.firmName }).pipe(
      Effect.onError((cause) =>
        accountants.deleteAuthUser(userId).pipe(
          Effect.catchCause((compensation) =>
            Effect.sync(() => {
              logger.error(
                `Falha ao compensar (apagar user ${userId}) após erro no public signup`,
                squashError(compensation),
              );
            }),
          ),
          Effect.andThen(
            Effect.sync(() => {
              logger.error('Falha ao provisionar firm', squashError(cause));
            }),
          ),
        ),
      ),
    ),
  );

  if (setCookie) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    /* O mesmo `res.setHeader('Set-Cookie', setCookie)` do `@Res({passthrough:true})`: o
     * valor é um array de linhas cruas do better-auth e o node as emite como headers
     * separados. `writeHead` do servidor Effect preserva o que já foi posto aqui. */
    (NodeHttpServerRequest.toServerResponse(request) as ServerResponse).setHeader(
      'Set-Cookie',
      setCookie,
    );
  }

  return { userId };
});

/* Um handler, dois caminhos (`@Controller(['auth/register', 'public-signup'])`). A chave de
 * throttle é compartilhada porque no Nest o balde era por classe+handler, não por path. */
const at = (path: '/auth/register' | '/public-signup') =>
  route('POST', path, handler('POST', register), {
    auth: publicRoute,
    throttleKey: 'POST auth/register',
  });

export const signupRoutes = Layer.mergeAll(at('/auth/register'), at('/public-signup'));

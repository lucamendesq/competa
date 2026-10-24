import { Effect, Layer } from 'effect';
import { fromRuntime } from '../../effect/runtime.js';
import { ContactContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { contactRoute } from '../../http/middleware/auth.js';
import { route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { ContactsRepo } from './contact.repo.js';

const profile = route(
  'GET',
  '/my/profile',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;

      const row = yield* fromRuntime(ContactsRepo.use((repo) => repo.profile(scope)));
      if (!row) return yield* Effect.fail(new NotFound('Responsável não encontrado.'));

      return row;
    }),
  ),
  { auth: contactRoute },
);

export const contactsRoutes = Layer.mergeAll(profile);

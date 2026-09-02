import { APIError, createAuthMiddleware } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../database/index.js';
import * as schema from '../database/schema/auth.js';

export default betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      // user.id is a uuid column, better-auth's default id is not a uuid
      generateId: () => uuidv7(),
    },
  },
  hooks: {
    // Não existe cadastro público: a Contabilidade nasce por script, o Contador
    // nasce por convite (SignUpUseCase). `ctx.request` só existe quando a chamada
    // veio pelo router HTTP (better-call/dist/router.mjs passa `request` no
    // contexto); a chamada server-side `auth.api.signUpEmail({ body })` não
    // define `request`, então atravessa este hook sem ser barrada.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;
      if (!ctx.request) return;

      throw new APIError('NOT_FOUND', {
        message: 'Cadastro aberto não existe neste produto. Use o link de convite.',
      });
    }),
  },
});

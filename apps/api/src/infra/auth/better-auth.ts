import { APIError, createAuthMiddleware } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
/* O plugin de passkey traz tipos do @simplewebauthn para dentro do tipo inferido daqui, e
 * o TS recusa exportar algo que cite dependência transitiva (TS2883). Importar o módulo
 * (mesmo sem usar nome nenhum) torna esses tipos nomeáveis. */
import { v7 as uuidv7 } from 'uuid';
import env from '../../config/env.js';
import { db } from '../database/index.js';
import * as schema from '../database/schema/auth.js';
import { sendMagicLink } from './magic-link-sender.js';

const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  trustedOrigins: [env.WEB_URL],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url, token }) => {
        await sendMagicLink({ email, url, token });
      },
    }),
    passkey({
      rpID: new URL(env.WEB_URL).hostname,
      rpName: 'Coleta de Documentos Contábeis',
      origin: env.WEB_URL,
    }),
  ],
  advanced: {
    database: {
      generateId: () => uuidv7(),
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;
      if (!ctx.request) return;

      throw new APIError('NOT_FOUND', {
        message: 'Cadastro aberto não existe neste produto. Use o link de convite.',
      });
    }),
  },
});

export default auth;

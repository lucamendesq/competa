import { APIError, createAuthMiddleware } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { v7 as uuidv7 } from 'uuid';
import env from '../../config/env.js';
import { db } from '../database/index.js';
import * as schema from '../database/schema/auth.js';

export default betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  trustedOrigins: [env.WEB_URL],
  emailAndPassword: {
    enabled: true,
  },
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

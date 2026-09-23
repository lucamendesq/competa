import { APIError, createAuthMiddleware } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
/* O plugin de passkey traz tipos do @simplewebauthn para dentro do tipo inferido daqui, e
 * o TS recusa exportar algo que cite dependência transitiva (TS2883). Importar o módulo
 * (mesmo sem usar nome nenhum) torna esses tipos nomeáveis. */
import { v7 as uuidv7 } from 'uuid';
import env, { allowedOrigins } from '../../config/env.js';
import { db } from '../database/index.js';
import * as schema from '../database/schema/auth.js';
import { sendMagicLink, sendResetPassword } from './magic-link-sender.js';

import { getDomain } from 'tldts';

const registrableDomain = (hostname: string) => {
  const domain = getDomain(hostname);
  if (!domain) throw new Error(`Hostname "${hostname}" is a public suffix or has no registrable domain.`);
  return domain;
};

const webHost = new URL(env.WEB_URL).hostname;
const authHost = new URL(env.BETTER_AUTH_URL).hostname;

const crossSubDomain = webHost !== authHost;

let parentDomain: string | undefined;
if (crossSubDomain) {
  const webReg = registrableDomain(webHost);
  const authReg = registrableDomain(authHost);
  if (webReg !== authReg) {
    throw new Error(
      `WEB_URL (${webHost}) e BETTER_AUTH_URL (${authHost}) não compartilham um domínio registrável: ` +
        'sirva os dois na mesma origem ou coloque-os sob o mesmo domínio.',
    );
  }
  parentDomain = webReg;
}

const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  trustedOrigins: allowedOrigins,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }) => {
      await sendResetPassword({ email: user.email, url, token });
    },
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
  },
  plugins: [
    magicLink({
      disableSignUp: true,
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
    /* Fly-Client-IP é escrito pelo proxy da Fly e não é forjável; sem isto o rate limiter
     * do better-auth cai num balde global quando X-Forwarded-For traz 2+ IPs. Só em
     * produção: em dev a lista substituiria o default e deixaria o limiter sem chave. */
    ...(env.NODE_ENV === 'production'
      ? { ipAddress: { ipAddressHeaders: ['fly-client-ip'] } }
      : {}),
    ...(crossSubDomain
      ? {
          crossSubDomainCookies: { enabled: true, domain: `.${parentDomain}` },
          /* app. e api. sob o mesmo domínio são same-site: `lax` mantém o fetch com
           * credenciais e barra o form-POST cross-site (CSRF-1). */
          defaultCookieAttributes: { sameSite: 'lax' as const, secure: true },
        }
      : {}),
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

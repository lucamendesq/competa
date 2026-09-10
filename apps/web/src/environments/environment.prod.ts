/** Web (Cloudflare Pages) e API (Fly.io) vivem em origens separadas sob o mesmo domínio —
 *  `app.competa.com.br` ↔ `api.competa.com.br`. `better-auth.ts` detecta isso sozinho
 *  (WEB_URL ≠ BETTER_AUTH_URL, mesmo domínio pai) e liga `crossSubDomainCookies` +
 *  `SameSite=None; Secure`; a API se recusa a subir se os dois hosts não compartilharem
 *  um domínio. */
export const environment = {
  production: true,
  apiUrl: 'https://api.competa.com.br',
  authUrl: 'https://api.competa.com.br/api/auth',
};

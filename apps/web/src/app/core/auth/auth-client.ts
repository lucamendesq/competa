import { magicLinkClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';
import { environment } from '../../../environments/environment';

/** Cliente do Better Auth: senha (Contador), passkey e magic link (Responsável).
 *  O Link de Upload NÃO passa por aqui — é token próprio do produto. */
export const authClient = createAuthClient({
  baseURL: environment.authUrl,
  fetchOptions: { credentials: 'include' },
  plugins: [magicLinkClient(), passkeyClient()],
});

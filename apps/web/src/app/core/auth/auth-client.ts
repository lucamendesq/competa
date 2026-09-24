import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';
import { environment } from '../../../environments/environment';

export const authClient = createAuthClient({
  baseURL: environment.authUrl,
  fetchOptions: { credentials: 'include' },
  plugins: [magicLinkClient()],
});

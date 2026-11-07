import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { env } from '@/shared/config/env';

export const authClient = createAuthClient({
  baseURL: env.authUrl,
  fetchOptions: { credentials: 'include' },
  plugins: [magicLinkClient()],
});

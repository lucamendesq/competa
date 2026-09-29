import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL || 'http://localhost:3000/api/auth',
  fetchOptions: { credentials: 'include' },
  plugins: [magicLinkClient()],
});

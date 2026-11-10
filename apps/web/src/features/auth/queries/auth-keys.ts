export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
  contactProfile: () => [...authKeys.all, 'contact-profile'] as const,
  invite: (token: string) => [...authKeys.all, 'invite', token] as const,
};

export const teamKeys = {
  all: ['team'] as const,
  accountants: () => [...teamKeys.all, 'accountants'] as const,
  invites: () => [...teamKeys.all, 'invites'] as const,
};

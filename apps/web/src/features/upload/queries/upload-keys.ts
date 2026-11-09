export const uploadKeys = {
  all: ['upload'] as const,
  checklist: (token: string) => [...uploadKeys.all, 'checklist', token] as const,
};

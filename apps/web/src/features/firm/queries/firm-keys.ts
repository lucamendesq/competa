export const firmKeys = {
  all: ['firm'] as const,
  detail: () => [...firmKeys.all, 'detail'] as const,
};

export const contactKeys = {
  all: ['contact-area'] as const,
  pending: () => [...contactKeys.all, 'pending'] as const,
  periodLists: () => [...contactKeys.all, 'periods'] as const,
  periods: (page: number) => [...contactKeys.periodLists(), page] as const,
  period: (periodId: string, companyId: string) =>
    [...contactKeys.all, 'period', periodId, companyId] as const,
};

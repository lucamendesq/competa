import { QueryClient, useIsMutating } from '@tanstack/react-query';
import { ApiError } from '@/shared/lib/api-error';

const isClientError = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => !isClientError(error) && failureCount < 3,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: 0 },
    },
  });

export const useWritesInFlight = () => useIsMutating() > 0;

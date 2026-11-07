import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

type ProviderOptions = {
  route?: string;
  path?: string;
};

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

function Providers({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function renderWithProviders(
  ui: ReactNode,
  { route = '/', path = '*', ...options }: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });

  return {
    queryClient,
    router,
    ...render(
      <Providers queryClient={queryClient}>
        <RouterProvider router={router} />
      </Providers>,
      options,
    ),
  };
}

export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, 'wrapper'> = {},
) {
  const queryClient = createTestQueryClient();

  return {
    queryClient,
    ...renderHook(hook, {
      ...options,
      wrapper: ({ children }) => <Providers queryClient={queryClient}>{children}</Providers>,
    }),
  };
}

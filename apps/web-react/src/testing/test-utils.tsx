import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { deriveSession, SessionContext, type Session } from '@/shared/session';

type SessionInput = Partial<Pick<Session, 'accountant' | 'contact' | 'status'>>;

type ProviderOptions = {
  route?: string;
  path?: string;
  session?: SessionInput;
};

export const testSession = (input: SessionInput = {}) =>
  deriveSession({
    status: input.status ?? 'ready',
    accountant: input.accountant ?? null,
    contact: input.contact ?? null,
  });

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

function Providers({
  children,
  queryClient,
  session,
}: {
  children: ReactNode;
  queryClient: QueryClient;
  session: SessionInput | undefined;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      {session ? (
        <SessionContext value={testSession(session)}>{children}</SessionContext>
      ) : (
        children
      )}
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactNode,
  {
    route = '/',
    path = '*',
    session,
    ...options
  }: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });

  return {
    queryClient,
    router,
    ...render(
      <Providers queryClient={queryClient} session={session}>
        <RouterProvider router={router} />
      </Providers>,
      options,
    ),
  };
}

export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  {
    session,
    ...options
  }: Omit<RenderHookOptions<Props>, 'wrapper'> & { session?: SessionInput } = {},
) {
  const queryClient = createTestQueryClient();

  return {
    queryClient,
    ...renderHook(hook, {
      ...options,
      wrapper: ({ children }) => (
        <Providers queryClient={queryClient} session={session}>
          {children}
        </Providers>
      ),
    }),
  };
}

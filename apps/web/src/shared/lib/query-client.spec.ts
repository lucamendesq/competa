import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { api } from '@/shared/lib/api-client';
import { makeQueryClient } from '@/shared/lib/query-client';
import { apiUrl } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const countCalls = (status: number) => {
  const calls = { count: 0 };
  server.use(
    http.get(apiUrl('/periods'), () => {
      calls.count += 1;
      return HttpResponse.json({ error: { code: 'X', message: 'x' } }, { status });
    }),
  );
  return calls;
};

const fetchPeriods = (queryClient: ReturnType<typeof makeQueryClient>) =>
  queryClient
    .fetchQuery({ queryKey: ['periods'], queryFn: () => api.get('/periods'), retryDelay: 0 })
    .catch((error: unknown) => error);

describe('makeQueryClient', () => {
  it('não repete uma query que recebeu 404', async () => {
    const calls = countCalls(404);
    const queryClient = makeQueryClient();

    await fetchPeriods(queryClient);

    expect(calls.count).toBe(1);
  });

  it('repete até 3 vezes uma query que recebeu 500', async () => {
    const calls = countCalls(500);
    const queryClient = makeQueryClient();

    await fetchPeriods(queryClient);

    expect(calls.count).toBe(4);
  });

  it('não repete mutations', () => {
    expect(makeQueryClient().getDefaultOptions().mutations?.retry).toBe(0);
  });
});

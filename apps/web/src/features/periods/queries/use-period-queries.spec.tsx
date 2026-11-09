import { waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { periodKeys } from '@/features/periods/queries/period-keys';
import { usePeriodPreview, usePeriods } from '@/features/periods/queries/use-period-queries';
import { period } from '@/testing/factories/period';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { renderHookWithProviders } from '@/testing/test-utils';

describe('usePeriods', () => {
  it('cada página tem sua key e a lista anterior fica visível enquanto a próxima carrega', async () => {
    let release: () => void = () => undefined;
    const pageTwoGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(apiUrl('/periods'), async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        if (page === 2) await pageTwoGate;
        return HttpResponse.json({
          data: [period({ referenceMonth: page === 1 ? '2026-11-01' : '2026-10-01' })],
          meta: { page, perPage: 1, total: 2 },
        });
      }),
    );
    const { result, rerender, queryClient } = renderHookWithProviders(
      ({ page }: { page: number }) => usePeriods({ page, perPage: 1 }),
      { initialProps: { page: 1 } },
    );
    await waitFor(() => expect(result.current.data?.meta.page).toBe(1));

    rerender({ page: 2 });

    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.data[0]?.referenceMonth).toBe('2026-11-01');
    release();
    await waitFor(() => expect(result.current.data?.meta.page).toBe(2));
    expect(periodKeys.list({ page: 1, perPage: 1 })).not.toEqual(
      periodKeys.list({ page: 2, perPage: 1 }),
    );
    expect(queryClient.getQueryData(periodKeys.list({ page: 1, perPage: 1 }))).toBeDefined();
  });
});

describe('usePeriodPreview', () => {
  it('só busca com o diálogo aberto e um mês YYYY-MM válido', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/periods/preview'), () => {
        calls += 1;
        return HttpResponse.json(
          envelope({ existingPeriodId: null, requests: [], skipped: [], notes: [] }),
        );
      }),
    );
    const { result, rerender } = renderHookWithProviders(
      ({ month, open }: { month: string; open: boolean }) =>
        usePeriodPreview(month, { enabled: open }),
      { initialProps: { month: '2026-11', open: false } },
    );
    expect(result.current.fetchStatus).toBe('idle');

    rerender({ month: '2026-13', open: true });
    expect(result.current.fetchStatus).toBe('idle');

    rerender({ month: '2026-11', open: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toBe(1);
  });
});

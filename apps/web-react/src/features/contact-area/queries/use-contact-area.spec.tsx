import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { contactKeys } from '@/features/contact-area/queries/contact-keys';
import { useSendMyFiles } from '@/features/contact-area/queries/use-contact-area';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { renderHookWithProviders } from '@/testing/test-utils';

describe('useSendMyFiles', () => {
  it('manda requestId e item no presign e invalida pendências e histórico', async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl('/my/documents'), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          envelope({
            files: [{ fileName: 'a.exe', accepted: false, reason: 'Formato não aceito.' }],
          }),
        );
      }),
    );
    const { result, queryClient } = renderHookWithProviders(() => useSendMyFiles());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    let results: Awaited<ReturnType<typeof result.current.sendFiles>> = [];
    await act(async () => {
      results = await result.current.sendFiles([new File(['x'], 'a.exe')], {
        requestId: 'r1',
        requestItemId: 'i1',
      });
    });

    expect(body).toMatchObject({ requestId: 'r1', requestItemId: 'i1' });
    expect(results).toEqual([{ fileName: 'a.exe', ok: false, reason: 'Formato não aceito.' }]);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      contactKeys.pending(),
      contactKeys.periodLists(),
    ]);
  });

  it('cada página do histórico e cada competência têm sua key', () => {
    expect(contactKeys.periods(1)).not.toEqual(contactKeys.periods(2));
    expect(contactKeys.period('p', 'c1')).not.toEqual(contactKeys.period('p', 'c2'));
  });
});

import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { uploadKeys } from '@/features/upload/queries/upload-keys';
import { useSendFiles } from '@/features/upload/queries/use-upload-queries';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { renderHookWithProviders } from '@/testing/test-utils';

describe('useSendFiles', () => {
  it('manda o item alvo no presign e, ao terminar, invalida o checklist do link', async () => {
    let presignBody: unknown;
    server.use(
      http.post(apiUrl('/upload/tok123/documents'), async ({ request }) => {
        presignBody = await request.json();
        return HttpResponse.json(
          envelope({
            files: [{ fileName: 'a.exe', accepted: false, reason: 'Formato não aceito.' }],
          }),
        );
      }),
    );
    const { result, queryClient } = renderHookWithProviders(() => useSendFiles('tok123'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    let results: Awaited<ReturnType<typeof result.current.sendFiles>> = [];
    await act(async () => {
      results = await result.current.sendFiles([new File(['x'], 'a.exe')], 'item-1');
    });

    expect(presignBody).toMatchObject({ requestItemId: 'item-1' });
    expect(results).toEqual([{ fileName: 'a.exe', ok: false, reason: 'Formato não aceito.' }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: uploadKeys.checklist('tok123') });
  });
});

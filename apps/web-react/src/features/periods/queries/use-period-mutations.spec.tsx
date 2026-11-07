import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { periodKeys, requestKeys } from '@/features/periods/queries/period-keys';
import {
  useAddMissingRequests,
  useClosePeriod,
  useCloseRequest,
  useOpenPeriod,
  usePublishReview,
  useResendUploadLink,
  useRunReminders,
  useUndoAccept,
  useUploadLink,
} from '@/features/periods/queries/use-period-mutations';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { renderHookWithProviders } from '@/testing/test-utils';

const ok = () => HttpResponse.json(envelope({}));

const invalidatedBy = async <Result,>(
  hook: () => { mutateAsync: (variables: never) => Promise<Result> },
  variables?: unknown,
) => {
  const { result, queryClient } = renderHookWithProviders(hook);
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  await act(() => result.current.mutateAsync(variables as never));
  return spy.mock.calls.map(([filters]) => filters?.queryKey);
};

describe('mutations de periods', () => {
  it('abrir competência invalida só a lista', async () => {
    server.use(http.post(apiUrl('/periods'), ok));

    expect(await invalidatedBy(useOpenPeriod, { referenceMonth: '2026-11' })).toEqual([
      periodKeys.lists(),
    ]);
  });

  it('incluir empresas novas invalida a lista e o detalhe da competência', async () => {
    server.use(http.post(apiUrl('/periods/p1/requests'), ok));

    expect(await invalidatedBy(() => useAddMissingRequests('p1'))).toEqual([
      periodKeys.lists(),
      periodKeys.detail('p1'),
    ]);
  });

  it('encerrar competência invalida a lista e o detalhe', async () => {
    server.use(http.post(apiUrl('/periods/p1/close'), ok));

    expect(await invalidatedBy(useClosePeriod, 'p1')).toEqual([
      periodKeys.lists(),
      periodKeys.detail('p1'),
    ]);
  });

  it('cobrar atrasados invalida só o painel', async () => {
    server.use(http.post(apiUrl('/messages/reminders/run'), ok));

    expect(await invalidatedBy(() => useRunReminders('p1'))).toEqual([periodKeys.panel('p1')]);
  });

  it('publicar revisão invalida a Solicitação e o painel da competência', async () => {
    server.use(http.post(apiUrl('/requests/r1/review'), ok));

    expect(
      await invalidatedBy(usePublishReview, {
        requestId: 'r1',
        periodId: 'p1',
        body: { acceptItemIds: [], rejectDocuments: [] },
      }),
    ).toEqual([requestKeys.detail('r1'), periodKeys.panel('p1')]);
  });

  it('desfazer aceite invalida a Solicitação e o painel', async () => {
    server.use(http.post(apiUrl('/request-items/i1/undo-accept'), ok));

    expect(
      await invalidatedBy(useUndoAccept, { requestId: 'r1', periodId: 'p1', requestItemId: 'i1' }),
    ).toEqual([requestKeys.detail('r1'), periodKeys.panel('p1')]);
  });

  it('encerrar Solicitação invalida a Solicitação, o painel e o detalhe da competência', async () => {
    server.use(http.post(apiUrl('/requests/r1/close'), ok));

    expect(await invalidatedBy(useCloseRequest, { requestId: 'r1', periodId: 'p1' })).toEqual([
      requestKeys.detail('r1'),
      periodKeys.panel('p1'),
      periodKeys.detail('p1'),
    ]);
  });

  it('reenviar e gerar link não invalidam nada', async () => {
    server.use(
      http.post(apiUrl('/requests/r1/upload-link/resend'), ok),
      http.post(apiUrl('/requests/r1/upload-link'), ok),
    );

    expect(await invalidatedBy(useResendUploadLink, 'r1')).toEqual([]);
    expect(await invalidatedBy(useUploadLink, 'r1')).toEqual([]);
  });
});

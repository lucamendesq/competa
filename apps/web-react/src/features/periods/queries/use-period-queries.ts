import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getPendingPanel } from '@/features/periods/api/get-pending-panel';
import { getPeriod } from '@/features/periods/api/get-period';
import { getPeriodPreview } from '@/features/periods/api/get-period-preview';
import { getPeriods, type PeriodListParams } from '@/features/periods/api/get-periods';
import { getRequest } from '@/features/periods/api/get-request';
import { periodKeys, requestKeys } from '@/features/periods/queries/period-keys';

const REFERENCE_MONTH = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const usePeriods = (params: PeriodListParams) =>
  useQuery({
    queryKey: periodKeys.list(params),
    queryFn: ({ signal }) => getPeriods(params, signal),
    placeholderData: keepPreviousData,
  });

export const usePeriodDetail = (id: string) =>
  useQuery({ queryKey: periodKeys.detail(id), queryFn: ({ signal }) => getPeriod(id, signal) });

export const usePendingPanel = (id: string) =>
  useQuery({
    queryKey: periodKeys.panel(id),
    queryFn: ({ signal }) => getPendingPanel(id, signal),
  });

export const usePeriodPreview = (referenceMonth: string, { enabled }: { enabled: boolean }) =>
  useQuery({
    queryKey: periodKeys.preview(referenceMonth),
    queryFn: ({ signal }) => getPeriodPreview(referenceMonth, signal),
    enabled: enabled && REFERENCE_MONTH.test(referenceMonth),
  });

export const useRequestDetail = (requestId: string) =>
  useQuery({
    queryKey: requestKeys.detail(requestId),
    queryFn: ({ signal }) => getRequest(requestId, signal),
  });

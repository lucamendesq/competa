import { useQuery } from '@tanstack/react-query';
import { getFirm } from '@/features/firm/api/get-firm';
import { firmKeys } from '@/features/firm/queries/firm-keys';

export const useFirm = () =>
  useQuery({ queryKey: firmKeys.detail(), queryFn: ({ signal }) => getFirm(signal) });

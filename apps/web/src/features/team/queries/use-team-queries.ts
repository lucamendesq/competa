import { useQuery } from '@tanstack/react-query';
import { getAccountants } from '@/features/team/api/get-accountants';
import { getPendingInvites } from '@/features/team/api/get-pending-invites';
import { teamKeys } from '@/features/team/queries/team-keys';

export const useAccountants = () =>
  useQuery({ queryKey: teamKeys.accountants(), queryFn: ({ signal }) => getAccountants(signal) });

export const usePendingInvites = () =>
  useQuery({ queryKey: teamKeys.invites(), queryFn: ({ signal }) => getPendingInvites(signal) });

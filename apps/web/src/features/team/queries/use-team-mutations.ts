import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createInvite } from '@/features/team/api/create-invite';
import { removeAccountant } from '@/features/team/api/remove-accountant';
import { revokeInvite } from '@/features/team/api/revoke-invite';
import { teamKeys } from '@/features/team/queries/team-keys';

export const useCreateInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => createInvite(email),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.invites() }),
  });
};

export const useRemoveAccountant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeAccountant(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.accountants() }),
  });
};

export const useRevokeInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.invites() }),
  });
};

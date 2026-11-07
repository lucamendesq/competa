import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  acceptContactInvite,
  confirmRecoverLink,
  getMe,
  recoverLink,
  registerFirm,
  requestPasswordReset,
  resetPassword,
  sendMagicLink,
  setContactPassword,
  signInWithPassword,
  signOut,
  signUpWithInvite,
  type FirmRegistration,
} from '@/features/auth/api/auth';
import { authKeys } from '@/features/auth/queries/auth-keys';

const refreshSession = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: authKeys.all });

const useSessionMutation = <Variables, Result>(
  mutationFn: (variables: Variables) => Promise<Result>,
) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => refreshSession(queryClient) });
};

export const useSignInAccountant = () => useSessionMutation(signInWithPassword);

export const useSignInContact = () => useSessionMutation(signInWithPassword);

export const useSignOut = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    onSettled: async () => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== authKeys.all[0] });
      await queryClient.resetQueries({ queryKey: authKeys.all });
    },
  });
};

export const useRegisterFirm = () =>
  useSessionMutation(async (body: FirmRegistration) => {
    await registerFirm(body);
    if (!(await getMe())) await signInWithPassword({ email: body.email, password: body.password });
  });

export const useSignUpWithInvite = () => useSessionMutation(signUpWithInvite);

export const useAcceptContactInvite = () =>
  useSessionMutation(({ token, ...body }: { token: string; name: string; password?: string }) =>
    acceptContactInvite(token, body),
  );

export const useRequestPasswordReset = () => useSessionMutation(requestPasswordReset);

export const useResetPassword = () => useSessionMutation(resetPassword);

export const useSendMagicLink = () => useSessionMutation(sendMagicLink);

export const useRecoverLink = () => useSessionMutation(recoverLink);

export const useConfirmRecoverLink = () => useSessionMutation(confirmRecoverLink);

export const useSetContactPassword = () => useSessionMutation(setContactPassword);

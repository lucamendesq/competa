export { authKeys } from '@/features/auth/queries/auth-keys';
export {
  meOptions,
  contactProfileOptions,
  useMeQuery,
  useContactProfileQuery,
  useMeSuspense,
  useContactProfileSuspense,
} from '@/features/auth/queries/session-queries';
export {
  useAcceptContactInvite,
  useConfirmRecoverLink,
  useRecoverLink,
  useRegisterFirm,
  useRequestPasswordReset,
  useResetPassword,
  useSendMagicLink,
  useSetContactPassword,
  useSignInAccountant,
  useSignInContact,
  useSignOut,
  useSignUpWithInvite,
} from '@/features/auth/queries/use-auth-mutations';

export const authPages = {
  login: () =>
    import('@/features/auth/components/login-page').then((module) => ({
      Component: module.LoginPage,
    })),
  register: () =>
    import('@/features/auth/components/register-page').then((module) => ({
      Component: module.RegisterPage,
    })),
  forgotPassword: () =>
    import('@/features/auth/components/forgot-password-page').then((module) => ({
      Component: module.ForgotPasswordPage,
    })),
  resetPassword: () =>
    import('@/features/auth/components/reset-password-page').then((module) => ({
      Component: module.ResetPasswordPage,
    })),
  invite: () =>
    import('@/features/auth/components/invite-page').then((module) => ({
      Component: module.InvitePage,
    })),
  contactSignIn: () =>
    import('@/features/auth/components/contact-sign-in-page').then((module) => ({
      Component: module.ContactSignInPage,
    })),
  contactSetPassword: () =>
    import('@/features/auth/components/contact-set-password-page').then((module) => ({
      Component: module.ContactSetPasswordPage,
    })),
  recoverLink: () =>
    import('@/features/auth/components/recover-link-page').then((module) => ({
      Component: module.RecoverLinkPage,
    })),
  recoverLinkConfirm: () =>
    import('@/features/auth/components/recover-link-confirm-page').then((module) => ({
      Component: module.RecoverLinkConfirmPage,
    })),
};

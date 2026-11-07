import { api, parsed } from '@/shared/lib/api-client';
import { ApiError } from '@/shared/lib/api-error';
import { authClient } from '@/shared/lib/auth-client';
import { AccountantSession, ContactSession } from '@/shared/session';

const noSessionStatus = new Set([401, 403, 404]);

const orNull = async <T>(load: () => Promise<T | null>) => {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && noSessionStatus.has(error.status)) return null;
    throw error;
  }
};

export const getMe = (signal?: AbortSignal) =>
  orNull(async () => {
    const data = await api.get<unknown>('/auth/me', signal ? { signal } : {});
    return data ? parsed(AccountantSession)(data) : null;
  });

export const getMyProfile = (signal?: AbortSignal) =>
  orNull(async () => {
    const data = await api.get<unknown>('/my/profile', signal ? { signal } : {});
    return data ? parsed(ContactSession)(data) : null;
  });

export type Credentials = { email: string; password: string };

export const signInWithPassword = async ({ email, password }: Credentials) => {
  const { error } = await authClient.signIn.email({ email, password });
  if (error) throw new Error('E-mail ou senha inválidos.');
};

export const signOut = async () => {
  try {
    await authClient.signOut();
  } catch {
    /* Sair é intenção do usuário, não um pedido que pode falhar pela metade: se a
     * chamada cair, o estado local some do mesmo jeito e a navegação para a tela de
     * entrada acontece. O cookie que sobrar morre no TTL da sessão. */
  }
};

export type InviteSignUp = { name: string; email: string; password: string; token: string };

export const signUpWithInvite = (body: InviteSignUp) => api.post('/auth/sign-up', body);

export type FirmRegistration = {
  userName: string;
  email: string;
  password: string;
  firmName: string;
  cnpj?: string;
};

export const registerFirm = (body: FirmRegistration) => api.post('/auth/register', body);

export const acceptContactInvite = (token: string, body: { name: string; password?: string }) =>
  api.post(`/invites/${token}/contact-account`, body);

export const recoverLink = (email: string) => api.post('/access/recover', { email });

export const confirmRecoverLink = (token: string) => api.post('/access/recover/confirm', { token });

export const setContactPassword = (password: string) =>
  api.post<void>('/my/password', { password });

export const requestPasswordReset = async (email: string) => {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: `${location.origin}/redefinir-senha`,
  });
  if (error) throw new Error('Não foi possível enviar o email. Tente de novo.');
};

export const resetPassword = async ({
  newPassword,
  token,
}: {
  newPassword: string;
  token: string;
}) => {
  const { error } = await authClient.resetPassword({ newPassword, token });
  if (!error) return 'done' as const;
  if (error.code === 'INVALID_TOKEN') return 'invalid-link' as const;
  throw new Error('Não foi possível redefinir a senha. Tente de novo.');
};

export const sendMagicLink = async ({
  email,
  callbackURL,
}: {
  email: string;
  callbackURL: string;
}) => {
  const { error } = await authClient.signIn.magicLink({ email, callbackURL });
  if (error) throw new Error('Não foi possível enviar o link. Confira o e-mail e tente de novo.');
};

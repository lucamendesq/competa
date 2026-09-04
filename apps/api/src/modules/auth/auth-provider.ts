import type { IncomingHttpHeaders } from 'node:http';
import { Result } from '../../lib/either.js';

export type SessionUser = { id: string; name: string; email: string };
export type AuthSession = { user: SessionUser };

export type Credentials = {
  email: string;
  password: string;
};

export type SignUpEmailInput = Credentials & {
  name: string;
};

export type SignUpEmailResponse = {
  userId: string;
};

export type PasswordlessUserInput = { name: string; email: string };
export type PasswordlessUserResponse = { userId: string; name: string };

export abstract class AuthProvider {
  /** Conta do Responsável (Fase 10): nasce SEM senha — ele entra por passkey ou magic
   *  link. Se o email já tem `user` (ex.: também é Contador), reaproveita em vez de
   *  duplicar identidade. */
  abstract createPasswordlessUser(
    input: PasswordlessUserInput,
  ): Promise<PasswordlessUserResponse>;
  abstract signUpEmail(input: SignUpEmailInput): Promise<Result<SignUpEmailResponse, unknown>>;
  abstract getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null>;
}

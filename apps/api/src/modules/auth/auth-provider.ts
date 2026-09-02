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

export abstract class AuthProvider {
  abstract signUpEmail(
    input: SignUpEmailInput,
  ): Promise<Result<SignUpEmailResponse, unknown>>;
  /** `null` quando não há sessão válida — nunca lança para esse caso. */
  abstract getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null>;
}

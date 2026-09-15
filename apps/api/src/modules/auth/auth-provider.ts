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

export type PasswordlessSignInInput = { name: string; email: string };
export type PasswordlessSignInResponse = { userId: string; setCookie: string[] };

export abstract class AuthProvider {
  abstract signUpEmail(input: SignUpEmailInput): Promise<Result<SignUpEmailResponse, unknown>>;
  abstract getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null>;

  abstract signInPasswordless(input: PasswordlessSignInInput): Promise<PasswordlessSignInResponse>;

  abstract sendSignInLink(email: string): Promise<void>;

  abstract setPassword(headers: IncomingHttpHeaders, newPassword: string): Promise<void>;
}

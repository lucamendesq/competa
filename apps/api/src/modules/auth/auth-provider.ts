import { Result } from '../../lib/either.js';

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

export type SignInEmailInput = Credentials;

export type SignInEmailResponse = {
  token: string;
};

export abstract class AuthProvider {
  abstract signUpEmail(
    input: SignUpEmailInput,
  ): Promise<Result<SignUpEmailResponse, unknown>>;
  abstract signInEmail(
    input: SignInEmailInput,
  ): Promise<Result<SignInEmailResponse, unknown>>;
}

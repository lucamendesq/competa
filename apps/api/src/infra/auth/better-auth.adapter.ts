import { Injectable } from '@nestjs/common';
import auth from './better-auth.js';
import {
  AuthProvider,
  SignInEmailInput,
  SignInEmailResponse,
  SignUpEmailInput,
  SignUpEmailResponse,
} from '../../modules/auth/auth-provider.js';
import { isFailure, Result, success, tryCatchAsync } from '../../lib/either.js';

@Injectable()
export class BetterAuthAdapter implements AuthProvider {
  async signUpEmail(input: SignUpEmailInput): Promise<Result<SignUpEmailResponse, unknown>> {
    const result = await tryCatchAsync(() => auth.api.signUpEmail({ body: input }));

    if (isFailure(result)) {
      return result;
    }

    return success({ userId: result.value.user.id });
  }

  async signInEmail(
    input: SignInEmailInput,
  ): Promise<Result<SignInEmailResponse, unknown>> {
    const result = await tryCatchAsync(() =>
      auth.api.signInEmail({ body: input }),
    );

    if (isFailure(result)) {
      return result;
    }

    return success({ token: result.value.token });
  }
}

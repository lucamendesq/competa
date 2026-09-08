import type { IncomingHttpHeaders } from 'node:http';
import { Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import auth from './better-auth.js';
import {
  AuthProvider,
  AuthSession,
  PasswordlessSignInInput,
  SignUpEmailInput,
  SignUpEmailResponse,
} from '../../modules/auth/auth-provider.js';
import { isFailure, Result, success, tryCatchAsync } from '../../lib/either.js';
import { withoutSendingMagicLink } from './magic-link-sender.js';
import { MagicLinkUnavailable } from '../../modules/auth/errors.js';

@Injectable()
export class BetterAuthAdapter implements AuthProvider {
  async signUpEmail(input: SignUpEmailInput): Promise<Result<SignUpEmailResponse, unknown>> {
    const result = await tryCatchAsync(() => auth.api.signUpEmail({ body: input }));

    if (isFailure(result)) {
      return result;
    }

    return success({ userId: result.value.user.id });
  }

  async signInPasswordless(input: PasswordlessSignInInput) {
    const link = await withoutSendingMagicLink(() =>
      auth.api.signInMagicLink({
        body: { email: input.email, name: input.name },
        headers: new Headers(),
      }),
    );

    if (!link) throw new MagicLinkUnavailable();

    const verified = await auth.api.magicLinkVerify({
      query: { token: link.token },
      headers: new Headers(),
      asResponse: true,
    });

    const session = await auth.api.getSession({ headers: forwardCookies(verified) });
    if (!session) throw new MagicLinkUnavailable();

    return { userId: session.user.id, setCookie: verified.headers.getSetCookie() };
  }

  async sendSignInLink(email: string) {
    await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
  }

  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) return null;

    const { id, name, email } = session.user;
    return { user: { id, name, email } };
  }
}

const forwardCookies = (response: Response) =>
  new Headers({
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  });

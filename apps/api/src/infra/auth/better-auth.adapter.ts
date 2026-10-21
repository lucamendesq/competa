import type { IncomingHttpHeaders } from 'node:http';
import { Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import auth from './better-auth.js';
import { AuthProvider, AuthSession, SignUpEmailInput } from '../../modules/auth/auth-provider.js';
import { isFailure, Result, success, tryCatchAsync } from '../../lib/either.js';

@Injectable()
export class BetterAuthAdapter implements AuthProvider {
  async signUpEmail(
    input: SignUpEmailInput,
    reqHeaders?: Headers,
  ): Promise<Result<{ userId: string; setCookie?: string[] }, unknown>> {
    const headers = reqHeaders ?? new Headers();
    headers.set('x-internal-signup', 'true');

    const result = await tryCatchAsync(() =>
      auth.api.signUpEmail({
        body: input,
        headers,
        asResponse: true,
      }),
    );

    if (isFailure(result)) {
      return result;
    }

    if (result.value instanceof Response) {
      let userId = '';
      try {
        const data = (await result.value.clone().json()) as { user?: { id?: string } };
        if (data.user?.id) userId = data.user.id;
      } catch {
        const session = await auth.api.getSession({ headers: forwardCookies(result.value) });
        userId = session?.user.id || '';
      }

      return success({
        userId,
        setCookie: result.value.headers.getSetCookie(),
      });
    }

    return success({ userId: (result.value as { user: { id: string } }).user.id });
  }

  async sendSignInLink(email: string) {
    await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
  }

  async setPassword(headers: IncomingHttpHeaders, newPassword: string) {
    await auth.api.setPassword({
      body: { newPassword },
      headers: fromNodeHeaders(headers),
    });
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

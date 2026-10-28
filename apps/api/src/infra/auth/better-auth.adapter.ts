import type { IncomingHttpHeaders } from 'node:http';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import auth from './better-auth.js';
import { AuthProvider, AuthSession, SignUpEmailInput } from '../../modules/auth/auth-provider.js';
import { failure, isFailure, Result, success, tryCatchAsync } from '../../lib/either.js';

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

    /* Com `asResponse`, o erro do Better Auth (e-mail já usado, senha longa demais) volta
     * como Response não-2xx em vez de lançar. Tratado como sucesso, seguia com `userId`
     * vazio até estourar no insert — 500, e o ramo de e-mail duplicado de quem chama nunca
     * disparava. Vira o mesmo `APIError` que o modo sem `asResponse` lançaria. */
    if (result.value instanceof Response && !result.value.ok) {
      const body = (await result.value
        .clone()
        .json()
        .catch(() => undefined)) as { code?: string; message?: string } | undefined;
      return failure(
        new APIError(result.value.status as ConstructorParameters<typeof APIError>[0], body),
      );
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

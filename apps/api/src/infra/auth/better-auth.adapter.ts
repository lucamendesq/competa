import type { IncomingHttpHeaders } from 'node:http';
import { Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import auth from './better-auth.js';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { user } from '../database/schema/auth.js';
import {
  AuthProvider,
  AuthSession,
  SignUpEmailInput,
  SignUpEmailResponse,
  PasswordlessUserInput,
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

  /** Sem senha: o `user` é criado direto (não há credencial a guardar). Email que já tem
   *  conta é reaproveitado — identidade duplicada quebraria o login por email. */
  async createPasswordlessUser(input: PasswordlessUserInput) {
    const [existing] = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.email, input.email))
      .limit(1);

    if (existing) return { userId: existing.id, name: existing.name };

    const [created] = await db
      .insert(user)
      .values({ name: input.name, email: input.email, emailVerified: false })
      .returning({ id: user.id, name: user.name });

    return { userId: created.id, name: created.name };
  }

  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) return null;

    const { id, name, email } = session.user;
    return { user: { id, name, email } };
  }
}

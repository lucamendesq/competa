import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database } from '../../../infra/database/database.js';
import { accountant, user } from '../../../infra/database/schema/index.js';
import { AppError } from '../../../lib/app-error.js';
import { failure, isFailure, PromiseResult, success } from '../../../lib/either.js';
import { AuthProvider } from '../auth-provider.js';
import { InviteRepository } from '../invite.repository.js';
import {
  EmailAlreadyRegistered,
  InviteAlreadyAccepted,
  InviteEmailMismatch,
  InviteExpired,
  InviteNotFound,
  InviteTargetUnsupported,
} from '../errors.js';

export type SignUpInput = {
  token: string;
  name: string;
  email: string;
  password: string;
};

/** Aceitar convite é o ÚNICO caminho de cadastro (spec D-02): a Contabilidade
 *  nasce pelo script create-firm, nunca por rota pública. */
@Injectable()
export class SignUpUseCase {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthProvider,
    private readonly invites: InviteRepository,
  ) {}

  async execute(input: SignUpInput): PromiseResult<{ userId: string }, AppError> {
    const found = await this.invites.findByToken(input.token);

    if (!found) return failure(new InviteNotFound());
    if (found.acceptedAt) return failure(new InviteAlreadyAccepted());
    if (found.expiresAt < new Date()) return failure(new InviteExpired());
    if (found.email.toLowerCase() !== input.email.toLowerCase()) {
      return failure(new InviteEmailMismatch());
    }

    const { accountingFirmId } = found;
    if (!accountingFirmId) return failure(new InviteTargetUnsupported());

    const signUp = await this.auth.signUpEmail({
      name: input.name,
      email: input.email,
      password: input.password,
    });
    if (isFailure(signUp)) return failure(new EmailAlreadyRegistered());

    const { userId } = signUp.value;

    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(accountant).values({ authUserId: userId, accountingFirmId });
        await this.invites.markAccepted(found.id, tx);
      });

      return success({ userId });
    } catch (error) {
      // compensação: sem o vínculo, a conta criada no Better Auth é lixo
      await this.db.delete(user).where(eq(user.id, userId));
      throw error;
    }
  }
}

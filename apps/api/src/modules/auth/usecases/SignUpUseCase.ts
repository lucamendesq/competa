import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { Database } from '../../../infra/database/database.js';
import {
  accountant as accountantSchema,
  contact as contactSchema,
  invite as inviteSchema,
  user as userSchema,
} from '../../../infra/database/schema/index.js';
import { AuthProvider } from '../auth-provider.js';
import { failure, isFailure, PromiseResult, success } from '../../../lib/either.js';
import { isBefore } from 'date-fns';

export type SignUpDto = {
  token: string;
  name: string;
  email: string;
  password: string;
};

@Injectable()
export class SignUpUseCase {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthProvider,
  ) {}

  async execute(input: SignUpDto): PromiseResult<null, Error> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');

    const [found] = await this.db
      .select()
      .from(inviteSchema)
      .where(and(eq(inviteSchema.tokenHash, tokenHash), isNull(inviteSchema.deletedAt)))
      .limit(1);
    if (!found) {
      return failure(new Error('invite not found'));
    }
    if (isBefore(found.expiresAt, new Date())) {
      return failure(new Error('invite expired'));
    }
    if (found.acceptedAt !== null) {
      return failure(new Error('invite already accepted'));
    }
    if (!found.accountingFirmId && !found.companyId) {
      return failure(new Error('invite misconfigured'));
    }

    const signUp = await this.auth.signUpEmail(input);
    if (isFailure(signUp)) {
      return failure(new Error('sign up failed', { cause: signUp.error }));
    }

    const { userId } = signUp.value;

    try {
      await this.db.transaction(async (tx) => {
        if (found.companyId) {
          await tx.insert(contactSchema).values({
            authUserId: userId,
            companyId: found.companyId,
            name: input.name,
            email: input.email,
          });
        }

        if (found.accountingFirmId) {
          await tx.insert(accountantSchema).values({
            authUserId: userId,
            accountingFirmId: found.accountingFirmId,
          });
        }

        await tx
          .update(inviteSchema)
          .set({ acceptedAt: new Date() })
          .where(eq(inviteSchema.id, found.id));
      });

      return success(null);
    } catch (error) {
      await this.db.delete(userSchema).where(eq(userSchema.id, userId));
      return failure(new Error('could not accept invite', { cause: error }));
    }
  }
}

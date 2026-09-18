import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountant, accountingFirm, invite, user } from '../../infra/database/schema/index.js';
import { InviteNotFound } from './errors.js';
import type { FirmScope } from './scope.js';

type FirmPatch = Partial<{
  name: string;
  reminderMax: number;
  reminderDueSoonDays: number;
  reminderGapDays: number;
  logoUrl: string | null;
  contactEmail: string | null;
}>;

@Injectable()
export class AccountantRepository {
  constructor(private readonly db: Database) {}

  async list(scope: FirmScope) {
    return this.db
      .select({
        id: accountant.id,
        name: user.name,
        email: user.email,
        owner: accountant.owner,
        createdAt: accountant.createdAt,
      })
      .from(accountant)
      .innerJoin(user, eq(user.id, accountant.authUserId))
      .where(eq(accountant.accountingFirmId, scope))
      .orderBy(asc(accountant.createdAt), asc(accountant.id));
  }

  async findInFirm(scope: FirmScope, accountantId: string) {
    const [row] = await this.db
      .select({ id: accountant.id, authUserId: accountant.authUserId, owner: accountant.owner })
      .from(accountant)
      .where(and(eq(accountant.id, accountantId), eq(accountant.accountingFirmId, scope)))
      .limit(1);

    return row;
  }

  async firm(scope: FirmScope) {
    const [row] = await this.db
      .select({
        id: accountingFirm.id,
        name: accountingFirm.name,
        reminderMax: accountingFirm.reminderMax,
        reminderDueSoonDays: accountingFirm.reminderDueSoonDays,
        reminderGapDays: accountingFirm.reminderGapDays,
        logoUrl: accountingFirm.logoUrl,
        contactEmail: accountingFirm.contactEmail,
      })
      .from(accountingFirm)
      .where(eq(accountingFirm.id, scope))
      .limit(1);

    return row;
  }

  async updateFirm(scope: FirmScope, patch: FirmPatch) {
    const [row] = await this.db
      .update(accountingFirm)
      .set(patch)
      .where(eq(accountingFirm.id, scope))
      .returning({ id: accountingFirm.id });

    return row;
  }

  async findMe(scope: FirmScope, authUserId: string) {
    const [row] = await this.db
      .select({
        accountantId: accountant.id,
        name: user.name,
        email: user.email,
        firmId: accountingFirm.id,
        firmName: accountingFirm.name,
        firmLogoUrl: accountingFirm.logoUrl,
        firmContactEmail: accountingFirm.contactEmail,
        owner: accountant.owner,
      })
      .from(accountant)
      .innerJoin(user, eq(user.id, accountant.authUserId))
      .innerJoin(accountingFirm, eq(accountingFirm.id, accountant.accountingFirmId))
      .where(and(eq(accountant.authUserId, authUserId), eq(accountant.accountingFirmId, scope)))
      .limit(1);

    return row;
  }

  /** Só o dono convida — e o dono é quem provisionou a Contabilidade (`create-firm`),
   *  ou seja, o Contador que entra pelo email do escritório. */
  async isOwner(scope: FirmScope, authUserId: string) {
    const [row] = await this.db
      .select({ owner: accountant.owner })
      .from(accountant)
      .where(and(eq(accountant.authUserId, authUserId), eq(accountant.accountingFirmId, scope)))
      .limit(1);

    return row?.owner === true;
  }

  async userExistsByEmail(email: string) {
    const [row] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(sql`lower(${user.email})`, email.toLowerCase()))
      .limit(1);

    return Boolean(row);
  }

  async acceptInvite(input: { authUserId: string; accountingFirmId: string; inviteId: string }) {
    await this.db.transaction(async (tx) => {
      const [updatedInvite] = await tx
        .update(invite)
        .set({ acceptedAt: new Date() })
        .where(
          and(eq(invite.id, input.inviteId), isNull(invite.deletedAt), isNull(invite.acceptedAt)),
        )
        .returning({ id: invite.id });

      if (!updatedInvite) throw new InviteNotFound();

      const [existente] = await tx
        .select({ id: accountant.id })
        .from(accountant)
        .where(eq(accountant.accountingFirmId, input.accountingFirmId))
        .limit(1);

      await tx.insert(accountant).values({
        authUserId: input.authUserId,
        accountingFirmId: input.accountingFirmId,
        owner: !existente,
      });

      await tx
        .update(user)
        .set({ emailVerified: true, termsAcceptedAt: new Date() })
        .where(eq(user.id, input.authUserId));
    });
  }

  async deleteAuthUser(authUserId: string) {
    await this.db.delete(user).where(eq(user.id, authUserId));
  }
}

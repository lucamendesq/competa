import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountant, accountingFirm, invite, user } from '../../infra/database/schema/index.js';
import type { FirmScope } from './scope.js';

@Injectable()
export class AccountantRepository {
  constructor(private readonly db: Database) {}

  async findMe(scope: FirmScope, authUserId: string) {
    const [row] = await this.db
      .select({
        accountantId: accountant.id,
        name: user.name,
        email: user.email,
        firmId: accountingFirm.id,
        firmName: accountingFirm.name,
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

  async acceptInvite(input: { authUserId: string; accountingFirmId: string; inviteId: string }) {
    await this.db.transaction(async (tx) => {
      /* O primeiro Contador da Contabilidade é o dono. `accountant_owner_uidx` (índice
       * único parcial) garante um só por tenant mesmo se dois signups correrem juntos. */
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
      await tx.update(invite).set({ acceptedAt: new Date() }).where(eq(invite.id, input.inviteId));
    });
  }

  async deleteAuthUser(authUserId: string) {
    await this.db.delete(user).where(eq(user.id, authUserId));
  }
}

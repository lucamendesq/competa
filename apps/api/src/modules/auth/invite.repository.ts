import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountingFirm, company, invite } from '../../infra/database/schema/index.js';
import { hashToken } from '../../lib/token.js';
import type { FirmScope } from './scope.js';

@Injectable()
export class InviteRepository {
  constructor(private readonly db: Database) {}

  async createForFirm(scope: FirmScope, input: { email: string; tokenHash: string; expiresAt: Date }) {
    const [row] = await this.db
      .insert(invite)
      .values({ ...input, accountingFirmId: scope })
      .returning();

    return row;
  }

  /** Busca pelo token em claro — só o hash existe no banco. Traz o nome da
   *  origem para a tela de convite ("Você foi convidado por X"). */
  async findByToken(token: string) {
    const [row] = await this.db
      .select({
        id: invite.id,
        email: invite.email,
        accountingFirmId: invite.accountingFirmId,
        companyId: invite.companyId,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt,
        firmName: accountingFirm.name,
        companyName: company.name,
      })
      .from(invite)
      .leftJoin(accountingFirm, eq(accountingFirm.id, invite.accountingFirmId))
      .leftJoin(company, eq(company.id, invite.companyId))
      .where(and(eq(invite.tokenHash, hashToken(token)), isNull(invite.deletedAt)))
      .limit(1);

    return row;
  }

  /** Aceita um executor opcional para participar da transação do signup. */
  async markAccepted(inviteId: string, tx: Database = this.db) {
    await tx.update(invite).set({ acceptedAt: new Date() }).where(eq(invite.id, inviteId));
  }
}

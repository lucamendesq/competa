import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountingFirm, company, invite } from '../../infra/database/schema/index.js';
import { hashToken } from '../../lib/token.js';
import { InviteAlreadyAccepted, InviteExpired, InviteNotFound } from './errors.js';
import type { FirmScope } from './scope.js';

@Injectable()
export class InviteRepository {
  constructor(private readonly db: Database) {}

  async createForFirm(
    scope: FirmScope,
    input: { email: string; tokenHash: string; expiresAt: Date },
  ) {
    const [row] = await this.db
      .insert(invite)
      .values({ ...input, accountingFirmId: scope })
      .returning();

    return row;
  }

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

  async findUsable(token: string) {
    const row = await this.findByToken(token);

    if (!row) throw new InviteNotFound();
    if (row.acceptedAt) throw new InviteAlreadyAccepted();
    if (row.expiresAt < new Date()) throw new InviteExpired();

    return row;
  }

  /** Nome da Contabilidade para o corpo do convite. */
  async firmName(scope: FirmScope) {
    const [row] = await this.db
      .select({ name: accountingFirm.name })
      .from(accountingFirm)
      .where(eq(accountingFirm.id, scope))
      .limit(1);

    return row?.name ?? '';
  }
}

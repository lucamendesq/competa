import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { alias } from 'drizzle-orm/pg-core';
import { accountingFirm, company, invite } from '../../infra/database/schema/index.js';

const companyFirm = alias(accountingFirm, 'company_firm');
import { hashToken } from '../../lib/token.js';
import { InviteAlreadyAccepted, InviteExpired, InviteNotFound } from './errors.js';
import type { FirmScope } from './scope.js';

@Injectable()
export class InviteRepository {
  constructor(private readonly db: Database) {}

  async createForFirm(
    scope: FirmScope,
    input: { email: string; tokenHash: string; expiresAt: Date; createdBy?: string },
  ) {
    const [row] = await this.db
      .insert(invite)
      .values({ ...input, accountingFirmId: scope })
      .returning();

    return row;
  }

  async createForCompany(input: {
    companyId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy?: string;
  }) {
    const [row] = await this.db.insert(invite).values(input).returning();

    return row;
  }

  /** Convites de Contador pendentes da Contabilidade (aba de equipe). */
  async listPending(scope: FirmScope) {
    return this.db
      .select({ id: invite.id, email: invite.email, expiresAt: invite.expiresAt })
      .from(invite)
      .where(
        and(
          eq(invite.accountingFirmId, scope),
          isNull(invite.acceptedAt),
          isNull(invite.deletedAt),
          gt(invite.expiresAt, new Date()),
        ),
      )
      .orderBy(invite.createdAt);
  }

  /** Revogar = `deleted_at`: `findByToken` já filtra por ele, então o link morre sozinho. */
  async revoke(scope: FirmScope, inviteId: string) {
    const [row] = await this.db
      .update(invite)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(invite.id, inviteId),
          eq(invite.accountingFirmId, scope),
          isNull(invite.acceptedAt),
          isNull(invite.deletedAt),
        ),
      )
      .returning({ id: invite.id });

    return row;
  }

  /** Convite de acesso ainda aberto para este email nesta Empresa — evita disparar um
   *  segundo email a cada vez que o Contador salva a mesma Empresa. */
  async pendingForContact(companyId: string, email: string) {
    const [row] = await this.db
      .select({ id: invite.id })
      .from(invite)
      .where(
        and(
          eq(invite.companyId, companyId),
          eq(invite.email, email),
          isNull(invite.acceptedAt),
          isNull(invite.deletedAt),
          gt(invite.expiresAt, new Date()),
        ),
      )
      .limit(1);

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
        // convite de Empresa não tem `accounting_firm_id`: a Contabilidade vem pela Empresa
        companyFirmName: companyFirm.name,
      })
      .from(invite)
      .leftJoin(accountingFirm, eq(accountingFirm.id, invite.accountingFirmId))
      .leftJoin(company, eq(company.id, invite.companyId))
      .leftJoin(companyFirm, eq(companyFirm.id, company.accountingFirmId))
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

  async markAccepted(inviteId: string) {
    await this.db.update(invite).set({ acceptedAt: new Date() }).where(eq(invite.id, inviteId));
  }

  async firmName(scope: FirmScope) {
    const [row] = await this.db
      .select({ name: accountingFirm.name })
      .from(accountingFirm)
      .where(eq(accountingFirm.id, scope))
      .limit(1);

    return row?.name ?? '';
  }
}

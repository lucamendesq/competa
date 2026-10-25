import { Context, Effect, Layer } from 'effect';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Db } from '../../infra/database/effect.js';
import { accountingFirm, company, invite } from '../../infra/database/schema/index.js';
import { hashToken } from '../../lib/token.js';
import { InviteAlreadyAccepted, InviteExpired, InviteNotFound } from './errors.js';
import type { FirmScope } from './scope.js';

const companyFirm = alias(accountingFirm, 'company_firm');

const make = Effect.gen(function* () {
  const db = yield* Db;

  const createForFirm = Effect.fn('InvitesRepo.createForFirm')(function* (
    scope: FirmScope,
    input: { email: string; tokenHash: string; expiresAt: Date; createdBy?: string },
  ) {
    const [row] = yield* db.use((d) =>
      d
        .insert(invite)
        .values({ ...input, accountingFirmId: scope })
        .returning(),
    );

    return row;
  });

  const createForCompany = Effect.fn('InvitesRepo.createForCompany')(function* (input: {
    companyId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy?: string;
  }) {
    const [row] = yield* db.use((d) => d.insert(invite).values(input).returning());

    return row;
  });

  /** Convites de Contador pendentes da Contabilidade (aba de equipe). */
  const listPending = Effect.fn('InvitesRepo.listPending')(function* (scope: FirmScope) {
    return yield* db.use((d) =>
      d
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
        .orderBy(invite.createdAt),
    );
  });

  /** Revogar = `deleted_at`: `findByToken` já filtra por ele, então o link morre sozinho. */
  const revoke = Effect.fn('InvitesRepo.revoke')(function* (scope: FirmScope, inviteId: string) {
    const [row] = yield* db.use((d) =>
      d
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
        .returning({ id: invite.id }),
    );

    return row;
  });

  /** Convidar de novo reemite: o Contador só clica porque o email anterior se perdeu. O
   *  pendente morre aqui para não deixar dois links vivos para o mesmo Responsável. */
  const revokePendingForContact = Effect.fn('InvitesRepo.revokePendingForContact')(function* (
    companyId: string,
    email: string,
  ) {
    yield* db.use((d) =>
      d
        .update(invite)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(invite.companyId, companyId),
            eq(invite.email, email),
            isNull(invite.acceptedAt),
            isNull(invite.deletedAt),
          ),
        ),
    );
  });

  const findByToken = Effect.fn('InvitesRepo.findByToken')(function* (token: string) {
    const [row] = yield* db.use((d) =>
      d
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
        .limit(1),
    );

    return row;
  });

  const findUsable = Effect.fn('InvitesRepo.findUsable')(function* (token: string) {
    const row = yield* findByToken(token);

    if (!row) return yield* Effect.fail(new InviteNotFound());
    if (row.acceptedAt) return yield* Effect.fail(new InviteAlreadyAccepted());
    if (row.expiresAt < new Date()) return yield* Effect.fail(new InviteExpired());

    return row;
  });

  const pendingForFirm = Effect.fn('InvitesRepo.pendingForFirm')(function* (
    scope: FirmScope,
    email: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({ id: invite.id })
        .from(invite)
        .where(
          and(
            eq(invite.accountingFirmId, scope),
            eq(sql`lower(${invite.email})`, email.toLowerCase()),
            isNull(invite.acceptedAt),
            isNull(invite.deletedAt),
            gt(invite.expiresAt, new Date()),
          ),
        )
        .limit(1),
    );

    return Boolean(row);
  });

  const markAccepted = Effect.fn('InvitesRepo.markAccepted')(function* (inviteId: string) {
    const [row] = yield* db.use((d) =>
      d
        .update(invite)
        .set({ acceptedAt: new Date() })
        .where(and(eq(invite.id, inviteId), isNull(invite.deletedAt), isNull(invite.acceptedAt)))
        .returning({ id: invite.id }),
    );

    if (!row) return yield* Effect.fail(new InviteNotFound());
  });

  const firmName = Effect.fn('InvitesRepo.firmName')(function* (scope: FirmScope) {
    const [row] = yield* db.use((d) =>
      d
        .select({ name: accountingFirm.name })
        .from(accountingFirm)
        .where(eq(accountingFirm.id, scope))
        .limit(1),
    );

    return row?.name ?? '';
  });

  return {
    createForFirm,
    createForCompany,
    listPending,
    revoke,
    revokePendingForContact,
    findByToken,
    findUsable,
    pendingForFirm,
    markAccepted,
    firmName,
  };
});

export class InvitesRepo extends Context.Service<InvitesRepo, Effect.Success<typeof make>>()(
  'competa/api/auth/InvitesRepo',
) {
  static readonly layerNoDeps = Layer.effect(InvitesRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}

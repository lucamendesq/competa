import { Context, Effect, Layer } from 'effect';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { addDays } from 'date-fns';
import { Db } from '../../infra/database/effect.js';
import type { UniqueViolation } from '../../infra/database/error.js';
import { ValidationError } from '../../lib/app-error.js';
import {
  accountant,
  accountingFirm,
  invite,
  subscription,
  user,
} from '../../infra/database/schema/index.js';
import { InviteNotFound } from './errors.js';
import type { FirmScope } from './scope.js';

type FirmPatch = Partial<{
  name: string;
  reminderMax: number;
  reminderDueSoonDays: number;
  reminderGapDays: number;
  logoUrl: string | null;
  contactEmail: string | null;
  cnpj: string;
}>;

const cnpjTakenOrDie = (violation: UniqueViolation) =>
  violation.constraint === 'accounting_firm_cnpj_uidx'
    ? Effect.fail(
        new ValidationError('Já existe uma Contabilidade com este CNPJ.', [
          { path: ['cnpj'], message: 'Já existe uma Contabilidade com este CNPJ.' },
        ]),
      )
    : Effect.die(violation.cause);

const make = Effect.gen(function* () {
  const db = yield* Db;

  const list = Effect.fn('AccountantsRepo.list')(function* (scope: FirmScope) {
    return yield* db.use((d) =>
      d
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
        .orderBy(asc(accountant.createdAt), asc(accountant.id)),
    );
  });

  const findInFirm = Effect.fn('AccountantsRepo.findInFirm')(function* (
    scope: FirmScope,
    accountantId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({ id: accountant.id, authUserId: accountant.authUserId, owner: accountant.owner })
        .from(accountant)
        .where(and(eq(accountant.id, accountantId), eq(accountant.accountingFirmId, scope)))
        .limit(1),
    );

    return row;
  });

  const findByAuthUserId = Effect.fn('AccountantsRepo.findByAuthUserId')(function* (
    authUserId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({
          id: accountant.id,
          accountingFirmId: accountant.accountingFirmId,
          subscriptionStatus: subscription.status,
          subscriptionPlanName: subscription.planName,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
        })
        .from(accountant)
        .leftJoin(subscription, eq(subscription.accountingFirmId, accountant.accountingFirmId))
        .where(eq(accountant.authUserId, authUserId))
        .limit(1),
    );

    return row;
  });

  const firm = Effect.fn('AccountantsRepo.firm')(function* (scope: FirmScope) {
    const [row] = yield* db.use((d) =>
      d
        .select({
          id: accountingFirm.id,
          name: accountingFirm.name,
          reminderMax: accountingFirm.reminderMax,
          reminderDueSoonDays: accountingFirm.reminderDueSoonDays,
          reminderGapDays: accountingFirm.reminderGapDays,
          logoUrl: accountingFirm.logoUrl,
          contactEmail: accountingFirm.contactEmail,
          cnpj: accountingFirm.cnpj,
          subscription: {
            id: subscription.id,
            planName: subscription.planName,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
        })
        .from(accountingFirm)
        .leftJoin(subscription, eq(subscription.accountingFirmId, accountingFirm.id))
        .where(eq(accountingFirm.id, scope))
        .limit(1),
    );

    return row;
  });

  const updateFirm = Effect.fn('AccountantsRepo.updateFirm')(function* (
    scope: FirmScope,
    patch: FirmPatch,
  ) {
    const [row] = yield* db
      .attempt((d) =>
        d
          .update(accountingFirm)
          .set(patch)
          .where(eq(accountingFirm.id, scope))
          .returning({ id: accountingFirm.id }),
      )
      .pipe(Effect.catchTag('UniqueViolation', cnpjTakenOrDie));

    return row;
  });

  const findMe = Effect.fn('AccountantsRepo.findMe')(function* (
    scope: FirmScope,
    authUserId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({
          accountantId: accountant.id,
          name: user.name,
          email: user.email,
          firmId: accountingFirm.id,
          firmName: accountingFirm.name,
          firmLogoUrl: accountingFirm.logoUrl,
          firmContactEmail: accountingFirm.contactEmail,
          firmCnpj: accountingFirm.cnpj,
          owner: accountant.owner,
          subscriptionStatus: subscription.status,
          subscriptionTrialEndsAt: subscription.trialEndsAt,
          subscriptionCurrentPeriodEnd: subscription.currentPeriodEnd,
          subscriptionPlanName: subscription.planName,
          subscriptionCycle: subscription.cycle,
          subscriptionPriceOverride: subscription.priceOverride,
        })
        .from(accountant)
        .innerJoin(user, eq(user.id, accountant.authUserId))
        .innerJoin(accountingFirm, eq(accountingFirm.id, accountant.accountingFirmId))
        .leftJoin(subscription, eq(subscription.accountingFirmId, accountingFirm.id))
        .where(and(eq(accountant.authUserId, authUserId), eq(accountant.accountingFirmId, scope)))
        .limit(1),
    );

    return row;
  });

  /** Só o dono convida — e o dono é quem provisionou a Contabilidade (`create-firm`),
   *  ou seja, o Contador que entra pelo email do escritório. */
  const isOwner = Effect.fn('AccountantsRepo.isOwner')(function* (
    scope: FirmScope,
    authUserId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({ owner: accountant.owner })
        .from(accountant)
        .where(and(eq(accountant.authUserId, authUserId), eq(accountant.accountingFirmId, scope)))
        .limit(1),
    );

    return row?.owner === true;
  });

  const userExistsByEmail = Effect.fn('AccountantsRepo.userExistsByEmail')(function* (
    email: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({ id: user.id })
        .from(user)
        .where(eq(sql`lower(${user.email})`, email.toLowerCase()))
        .limit(1),
    );

    return Boolean(row);
  });

  const acceptInvite = Effect.fn('AccountantsRepo.acceptInvite')(function* (input: {
    authUserId: string;
    accountingFirmId: string;
    inviteId: string;
  }) {
    yield* db.withTransaction(
      Effect.gen(function* () {
        const [updatedInvite] = yield* db.use((d) =>
          d
            .update(invite)
            .set({ acceptedAt: new Date() })
            .where(
              and(
                eq(invite.id, input.inviteId),
                isNull(invite.deletedAt),
                isNull(invite.acceptedAt),
              ),
            )
            .returning({ id: invite.id }),
        );

        if (!updatedInvite) return yield* Effect.fail(new InviteNotFound());

        const [existing] = yield* db.use((d) =>
          d
            .select({ id: accountant.id })
            .from(accountant)
            .where(eq(accountant.accountingFirmId, input.accountingFirmId))
            .limit(1),
        );

        yield* db.use((d) =>
          d.insert(accountant).values({
            authUserId: input.authUserId,
            accountingFirmId: input.accountingFirmId,
            owner: !existing,
          }),
        );

        yield* db.use((d) =>
          d
            .update(user)
            .set({ emailVerified: true, termsAcceptedAt: new Date() })
            .where(eq(user.id, input.authUserId)),
        );
      }),
    );
  });

  const deleteAuthUser = Effect.fn('AccountantsRepo.deleteAuthUser')(function* (
    authUserId: string,
  ) {
    yield* db.use((d) => d.delete(user).where(eq(user.id, authUserId)));
  });

  const provisionFirm = Effect.fn('AccountantsRepo.provisionFirm')(function* (input: {
    authUserId: string;
    firmName: string;
    cnpj?: string;
  }) {
    yield* db.withTransaction(
      Effect.gen(function* () {
        const [firmRow] = yield* db
          .attempt((d) =>
            d
              .insert(accountingFirm)
              .values({ name: input.firmName, cnpj: input.cnpj ?? null })
              .returning(),
          )
          .pipe(Effect.catchTag('UniqueViolation', cnpjTakenOrDie));

        yield* db.use((d) =>
          d.insert(subscription).values({
            accountingFirmId: firmRow.id,
            planName: 'trial',
            status: 'trialing',
            trialEndsAt: addDays(new Date(), 14),
          }),
        );

        yield* db.use((d) =>
          d.insert(accountant).values({
            authUserId: input.authUserId,
            accountingFirmId: firmRow.id,
            owner: true,
          }),
        );

        yield* db.use((d) =>
          d
            .update(user)
            .set({ emailVerified: true, termsAcceptedAt: new Date() })
            .where(eq(user.id, input.authUserId)),
        );
      }),
    );
  });

  return {
    list,
    findInFirm,
    findByAuthUserId,
    firm,
    updateFirm,
    findMe,
    isOwner,
    userExistsByEmail,
    acceptInvite,
    deleteAuthUser,
    provisionFirm,
  };
});

export class AccountantsRepo extends Context.Service<
  AccountantsRepo,
  Effect.Success<typeof make>
>()('competa/api/auth/AccountantsRepo') {
  static readonly layerNoDeps = Layer.effect(AccountantsRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}

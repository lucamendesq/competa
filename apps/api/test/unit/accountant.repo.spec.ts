import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { addDays, subDays } from 'date-fns';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountant,
  accountingFirm,
  invite,
  subscription,
  user as authUser,
} from '../../src/infra/database/schema/index.js';
import { AccountantsRepo } from '../../src/modules/auth/accountant.repo.js';
import { InviteNotFound } from '../../src/modules/auth/errors.js';
import { toFirmScope } from '../../src/modules/auth/scope.js';

let seq = 0;

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedUser = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(authUser)
      .values({ name, email: `conta-${++seq}@example.com` })
      .returning({ id: authUser.id, email: authUser.email });

    return row;
  });

const seedInvite = (
  firmId: string,
  overrides: { acceptedAt?: Date; deletedAt?: Date; expiresAt?: Date } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(invite)
      .values({
        accountingFirmId: firmId,
        email: `convidado-${++seq}@example.com`,
        tokenHash: `hash-${seq}`,
        expiresAt: overrides.expiresAt ?? addDays(new Date(), 7),
        acceptedAt: overrides.acceptedAt ?? null,
        deletedAt: overrides.deletedAt ?? null,
      })
      .returning({ id: invite.id });

    return row.id;
  });

layer(AccountantsRepo.layer)('AccountantsRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('provisionFirm cria firma, trial de 14 dias, dono e verifica o usuário', () =>
    Effect.gen(function* () {
      const repo = yield* AccountantsRepo;
      const account = yield* seedUser('Dona Alfa');

      yield* repo.provisionFirm({ authUserId: account.id, firmName: 'Contabilidade Alfa' });

      const row = yield* repo.findByAuthUserId(account.id);
      expect(row).toMatchObject({ subscriptionPlanName: 'trial', subscriptionStatus: 'trialing' });

      const firm = yield* repo.firm(toFirmScope(row!.accountingFirmId));
      expect(firm).toMatchObject({ name: 'Contabilidade Alfa' });

      expect(yield* repo.isOwner(toFirmScope(row!.accountingFirmId), account.id)).toBe(true);

      const [saved] = yield* Effect.promise(() =>
        db.select().from(authUser).where(eq(authUser.id, account.id)),
      );
      expect(saved.emailVerified).toBe(true);
      expect(saved.termsAcceptedAt).not.toBeNull();
    }),
  );

  it.effect('acceptInvite marca o convite, vincula e torna o primeiro membro dono', () =>
    Effect.gen(function* () {
      const repo = yield* AccountantsRepo;
      const scope = yield* seedFirm('Firma Convite');
      const first = yield* seedUser('Primeira');
      const second = yield* seedUser('Segunda');

      yield* repo.acceptInvite({
        authUserId: first.id,
        accountingFirmId: scope,
        inviteId: yield* seedInvite(scope),
      });
      yield* repo.acceptInvite({
        authUserId: second.id,
        accountingFirmId: scope,
        inviteId: yield* seedInvite(scope),
      });

      expect(yield* repo.isOwner(scope, first.id)).toBe(true);
      expect(yield* repo.isOwner(scope, second.id)).toBe(false);
      expect((yield* repo.list(scope)).map((row) => row.name)).toEqual(['Primeira', 'Segunda']);
    }),
  );

  it.effect('acceptInvite recusa convite já aceito, revogado ou expirado sem vincular', () =>
    Effect.gen(function* () {
      const repo = yield* AccountantsRepo;
      const scope = yield* seedFirm('Firma Recusa');
      const account = yield* seedUser('Recusado');

      const accepted = yield* seedInvite(scope, { acceptedAt: new Date() });
      const revoked = yield* seedInvite(scope, { deletedAt: new Date() });

      for (const inviteId of [accepted, revoked]) {
        const error = yield* repo
          .acceptInvite({ authUserId: account.id, accountingFirmId: scope, inviteId })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(InviteNotFound);
      }

      expect(yield* repo.findByAuthUserId(account.id)).toBeUndefined();
    }),
  );

  /* A transação é a razão de `acceptInvite` existir como um método só: o insert quebra
   * DEPOIS do update do convite, e o convite tem de voltar a estar usável. */
  it.effect('acceptInvite desfaz o aceite quando o vínculo falha', () =>
    Effect.gen(function* () {
      const repo = yield* AccountantsRepo;
      const scope = yield* seedFirm('Firma Rollback');
      const inviteId = yield* seedInvite(scope);
      const unknownUser = '018f0000-0000-7000-8000-0000000000ff';

      const exit = yield* Effect.exit(
        repo.acceptInvite({ authUserId: unknownUser, accountingFirmId: scope, inviteId }),
      );
      expect(exit._tag).toBe('Failure');

      const [row] = yield* Effect.promise(() =>
        db.select().from(invite).where(eq(invite.id, inviteId)),
      );
      expect(row.acceptedAt, 'o convite volta a estar pendente').toBeNull();
    }),
  );

  it.effect('userExistsByEmail ignora caixa; findInFirm e firm são escopados por tenant', () =>
    Effect.gen(function* () {
      const repo = yield* AccountantsRepo;
      const scope = yield* seedFirm('Firma Escopo');
      const other = yield* seedFirm('Firma Vizinha');
      const account = yield* seedUser('Escopo');

      yield* repo.acceptInvite({
        authUserId: account.id,
        accountingFirmId: scope,
        inviteId: yield* seedInvite(scope),
      });

      expect(yield* repo.userExistsByEmail(account.email.toUpperCase())).toBe(true);
      expect(yield* repo.userExistsByEmail('ninguem@example.com')).toBe(false);

      const [member] = yield* repo.list(scope);
      expect(yield* repo.findInFirm(scope, member.id)).toMatchObject({ owner: true });
      expect(
        yield* repo.findInFirm(other, member.id),
        'id de outra firma não resolve',
      ).toBeUndefined();

      expect(yield* repo.findMe(scope, account.id)).toMatchObject({ firmName: 'Firma Escopo' });
      expect(yield* repo.findMe(other, account.id)).toBeUndefined();
      expect(yield* repo.isOwner(other, account.id)).toBe(false);
    }),
  );

  it.effect('updateFirm aplica o patch parcial e deleteAuthUser derruba o vínculo', () =>
    Effect.gen(function* () {
      const repo = yield* AccountantsRepo;
      const scope = yield* seedFirm('Firma Patch');
      const account = yield* seedUser('Patch');

      yield* repo.acceptInvite({
        authUserId: account.id,
        accountingFirmId: scope,
        inviteId: yield* seedInvite(scope),
      });

      yield* repo.updateFirm(scope, { logoUrl: 'https://cdn.example.com/logo.png' });
      expect(yield* repo.firm(scope)).toMatchObject({
        name: 'Firma Patch',
        logoUrl: 'https://cdn.example.com/logo.png',
        contactEmail: null,
      });

      yield* repo.deleteAuthUser(account.id);
      expect(yield* repo.list(scope)).toEqual([]);
      expect(yield* repo.findByAuthUserId(account.id)).toBeUndefined();
    }),
  );

  it.effect('findByAuthUserId devolve o trial vencido sem decidir nada', () =>
    Effect.gen(function* () {
      const repo = yield* AccountantsRepo;
      const scope = yield* seedFirm('Firma Vencida');
      const account = yield* seedUser('Vencida');
      const trialEndsAt = subDays(new Date(), 1);

      yield* Effect.promise(() =>
        db
          .insert(subscription)
          .values({ accountingFirmId: scope, planName: 'trial', status: 'trialing', trialEndsAt }),
      );
      yield* Effect.promise(() =>
        db.insert(accountant).values({ accountingFirmId: scope, authUserId: account.id }),
      );

      const row = yield* repo.findByAuthUserId(account.id);
      expect(row?.subscriptionStatus).toBe('trialing');
      expect(row?.trialEndsAt?.getTime()).toBe(trialEndsAt.getTime());
    }),
  );
});

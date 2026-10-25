import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { addDays, subDays } from 'date-fns';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import { accountingFirm, company, invite } from '../../src/infra/database/schema/index.js';
import {
  InviteAlreadyAccepted,
  InviteExpired,
  InviteNotFound,
} from '../../src/modules/auth/errors.js';
import { InvitesRepo } from '../../src/modules/auth/invite.repo.js';
import { toFirmScope } from '../../src/modules/auth/scope.js';
import { hashToken } from '../../src/lib/token.js';

let seq = 0;

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedCompany = (firmId: string, name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(company)
      .values({ accountingFirmId: firmId, name })
      .returning({ id: company.id });

    return row.id;
  });

const tokenOf = () => `token-${++seq}`;

layer(InvitesRepo.layer)('InvitesRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('createForFirm e findUsable fecham o ciclo pelo hash do token', () =>
    Effect.gen(function* () {
      const repo = yield* InvitesRepo;
      const scope = yield* seedFirm('Firma Convite');
      const token = tokenOf();

      const created = yield* repo.createForFirm(scope, {
        email: 'Convidado@Example.com',
        tokenHash: hashToken(token),
        expiresAt: addDays(new Date(), 7),
      });

      expect(yield* repo.findUsable(token)).toMatchObject({
        id: created.id,
        firmName: 'Firma Convite',
        companyName: null,
        accountingFirmId: scope,
      });
    }),
  );

  it.effect('createForCompany traz o nome da Contabilidade pela Empresa', () =>
    Effect.gen(function* () {
      const repo = yield* InvitesRepo;
      const scope = yield* seedFirm('Firma da Empresa');
      const companyId = yield* seedCompany(scope, 'Padaria Ltda');
      const token = tokenOf();

      yield* repo.createForCompany({
        companyId,
        email: 'resp@example.com',
        tokenHash: hashToken(token),
        expiresAt: addDays(new Date(), 7),
      });

      expect(yield* repo.findUsable(token)).toMatchObject({
        accountingFirmId: null,
        companyName: 'Padaria Ltda',
        firmName: null,
        companyFirmName: 'Firma da Empresa',
      });
    }),
  );

  it.effect('findUsable separa inexistente, já aceito e expirado', () =>
    Effect.gen(function* () {
      const repo = yield* InvitesRepo;
      const scope = yield* seedFirm('Firma Estados');

      expect(yield* repo.findUsable('nunca-existiu').pipe(Effect.flip)).toBeInstanceOf(
        InviteNotFound,
      );

      const acceptedToken = tokenOf();
      const accepted = yield* repo.createForFirm(scope, {
        email: 'aceito@example.com',
        tokenHash: hashToken(acceptedToken),
        expiresAt: addDays(new Date(), 7),
      });
      yield* repo.markAccepted(accepted.id);
      expect(yield* repo.findUsable(acceptedToken).pipe(Effect.flip)).toBeInstanceOf(
        InviteAlreadyAccepted,
      );

      const expiredToken = tokenOf();
      yield* repo.createForFirm(scope, {
        email: 'expirado@example.com',
        tokenHash: hashToken(expiredToken),
        expiresAt: subDays(new Date(), 1),
      });
      expect(yield* repo.findUsable(expiredToken).pipe(Effect.flip)).toBeInstanceOf(InviteExpired);
    }),
  );

  /* Revogar é `deleted_at`, e `findByToken` filtra por ele: o link morre sem precisar de
   * varredura. É também o que impede o aceite concorrente (bug congelado do TOCTOU). */
  it.effect('revoke é escopado por tenant e mata o link; markAccepted vira uso único', () =>
    Effect.gen(function* () {
      const repo = yield* InvitesRepo;
      const scope = yield* seedFirm('Firma Revoga');
      const other = yield* seedFirm('Firma Vizinha');
      const token = tokenOf();

      const created = yield* repo.createForFirm(scope, {
        email: 'revogado@example.com',
        tokenHash: hashToken(token),
        expiresAt: addDays(new Date(), 7),
      });

      expect(yield* repo.revoke(other, created.id), 'outra firma não revoga').toBeUndefined();
      expect(yield* repo.revoke(scope, created.id)).toMatchObject({ id: created.id });
      expect(
        yield* repo.revoke(scope, created.id),
        'revogar duas vezes não faz nada',
      ).toBeUndefined();

      expect(yield* repo.findByToken(token)).toBeUndefined();
      expect(yield* repo.markAccepted(created.id).pipe(Effect.flip)).toBeInstanceOf(InviteNotFound);
    }),
  );

  it.effect('pendingForFirm ignora caixa, aceitos, revogados e expirados', () =>
    Effect.gen(function* () {
      const repo = yield* InvitesRepo;
      const scope = yield* seedFirm('Firma Pendentes');

      const pending = yield* repo.createForFirm(scope, {
        email: 'pendente@example.com',
        tokenHash: hashToken(tokenOf()),
        expiresAt: addDays(new Date(), 7),
      });
      yield* repo.createForFirm(scope, {
        email: 'vencido@example.com',
        tokenHash: hashToken(tokenOf()),
        expiresAt: subDays(new Date(), 1),
      });

      expect(yield* repo.pendingForFirm(scope, 'PENDENTE@EXAMPLE.COM')).toBe(true);
      expect(yield* repo.pendingForFirm(scope, 'vencido@example.com')).toBe(false);
      expect((yield* repo.listPending(scope)).map((row) => row.id)).toEqual([pending.id]);

      yield* repo.revoke(scope, pending.id);
      expect(yield* repo.pendingForFirm(scope, 'pendente@example.com')).toBe(false);
      expect(yield* repo.listPending(scope)).toEqual([]);
    }),
  );

  it.effect('revokePendingForContact derruba só o pendente daquele email na Empresa', () =>
    Effect.gen(function* () {
      const repo = yield* InvitesRepo;
      const scope = yield* seedFirm('Firma Reconvite');
      const companyId = yield* seedCompany(scope, 'Alvo Ltda');
      const otherCompanyId = yield* seedCompany(scope, 'Outra Ltda');
      const email = 'reconvidado@example.com';

      const first = tokenOf();
      yield* repo.createForCompany({
        companyId,
        email,
        tokenHash: hashToken(first),
        expiresAt: addDays(new Date(), 7),
      });
      const neighbour = tokenOf();
      yield* repo.createForCompany({
        companyId: otherCompanyId,
        email,
        tokenHash: hashToken(neighbour),
        expiresAt: addDays(new Date(), 7),
      });

      yield* repo.revokePendingForContact(companyId, email);

      expect(yield* repo.findByToken(first)).toBeUndefined();
      expect(yield* repo.findByToken(neighbour)).toBeDefined();
    }),
  );

  it.effect('firmName devolve string vazia para firma inexistente', () =>
    Effect.gen(function* () {
      const repo = yield* InvitesRepo;
      const scope = yield* seedFirm('Firma Nome');

      expect(yield* repo.firmName(scope)).toBe('Firma Nome');

      yield* Effect.promise(() =>
        db
          .delete(accountingFirm)
          .where(eq(accountingFirm.id, scope))
          .then(() => undefined),
      );
      expect(yield* repo.firmName(scope)).toBe('');

      yield* Effect.promise(() => db.delete(invite).then(() => undefined));
    }),
  );
});

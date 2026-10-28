import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  account,
  accountant,
  accountingFirm,
  company,
  contact,
  period,
  pushSubscription,
  request,
  uploadLink,
  user as authUser,
} from '../../src/infra/database/schema/index.js';
import { toContactScope, toFirmScope } from '../../src/modules/auth/scope.js';
import { ContactsRepo } from '../../src/modules/contacts/contact.repo.js';

let seq = 0;

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedCompany = (firmId: string, name: string, active = true) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(company)
      .values({ accountingFirmId: firmId, name, active })
      .returning({ id: company.id });

    return row.id;
  });

const seedContact = (companyId: string, opts: { email?: string; authUserId?: string } = {}) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(contact)
      .values({
        companyId,
        name: `Resp ${++seq}`,
        email: opts.email ?? `resp-${seq}@example.com`,
        authUserId: opts.authUserId ?? null,
      })
      .returning({ id: contact.id, email: contact.email });

    return row;
  });

const seedAuthUser = (email: string, password?: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(authUser)
      .values({ name: 'Conta', email })
      .returning({ id: authUser.id });
    await db.insert(account).values({
      issuer: 'local',
      accountId: email,
      providerId: 'credential',
      userId: row.id,
      password: password ?? null,
    });

    return row.id;
  });

layer(ContactsRepo.layer)('ContactsRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('profile agrega vínculos e detecta credencial de senha', () =>
    Effect.gen(function* () {
      const repo = yield* ContactsRepo;
      const firmId = yield* seedFirm('Firma P');
      const companyA = yield* seedCompany(firmId, 'P Alfa');
      const companyB = yield* seedCompany(firmId, 'P Beta');
      const userId = yield* seedAuthUser('perfil@example.com', 'hash-de-senha');
      const first = yield* seedContact(companyA, {
        email: 'perfil@example.com',
        authUserId: userId,
      });
      const second = yield* seedContact(companyB, {
        email: 'perfil@example.com',
        authUserId: userId,
      });

      const scope = toContactScope([
        { contactId: first.id, companyId: companyA },
        { contactId: second.id, companyId: companyB },
      ]);
      const found = yield* repo.profile(scope);

      expect(found).toMatchObject({
        contactId: first.id,
        email: 'perfil@example.com',
        companyName: 'P Alfa',
        hasPassword: true,
      });
      expect(found!.companies.map((row) => row.companyName)).toEqual(['P Alfa', 'P Beta']);

      const empty = yield* repo.profile(
        toContactScope([
          { contactId: '018f0000-0000-7000-8000-00000000dead', companyId: companyA },
        ]),
      );
      expect(empty).toBeUndefined();
    }),
  );

  it.effect('userByEmail distingue contador de responsável (case-insensitive)', () =>
    Effect.gen(function* () {
      const repo = yield* ContactsRepo;
      const firmId = yield* seedFirm('Firma U');
      const companyId = yield* seedCompany(firmId, 'U Ltda');

      const contactUserId = yield* seedAuthUser('resp-u@example.com');
      yield* seedContact(companyId, { email: 'resp-u@example.com', authUserId: contactUserId });

      const accountantUserId = yield* seedAuthUser('contadora-u@example.com');
      yield* Effect.promise(() =>
        db.insert(accountant).values({ accountingFirmId: firmId, authUserId: accountantUserId }),
      );

      expect(yield* repo.userByEmail('RESP-U@example.com')).toMatchObject({
        isAccountant: false,
        isContact: true,
      });
      expect(yield* repo.userByEmail('contadora-u@example.com')).toMatchObject({
        isAccountant: true,
        isContact: false,
      });
      expect(yield* repo.userByEmail('ninguem@example.com')).toBeUndefined();
    }),
  );

  it.effect('revokeAccess: revoga vínculo, push e links; apaga o user só no último vínculo', () =>
    Effect.gen(function* () {
      const repo = yield* ContactsRepo;
      const firmId = yield* seedFirm('Firma R');
      const companyA = yield* seedCompany(firmId, 'R Alfa');
      const companyB = yield* seedCompany(firmId, 'R Beta');
      const userId = yield* seedAuthUser('revoga@example.com');
      const linkedA = yield* seedContact(companyA, {
        email: 'revoga@example.com',
        authUserId: userId,
      });
      const linkedB = yield* seedContact(companyB, {
        email: 'revoga@example.com',
        authUserId: userId,
      });

      yield* Effect.promise(async () => {
        const [row] = await db
          .insert(period)
          .values({ accountingFirmId: firmId, referenceMonth: '2026-01-01' })
          .returning({ id: period.id });
        const [req] = await db
          .insert(request)
          .values({ periodId: row.id, companyId: companyA })
          .returning({ id: request.id });
        await db.insert(uploadLink).values({
          requestId: req.id,
          contactId: linkedA.id,
          tokenHash: 'hash-revoga',
          expiresAt: new Date(Date.now() + 86_400_000),
        });
        await db.insert(pushSubscription).values({
          contactId: linkedA.id,
          endpoint: 'https://push.example.com/revoga',
          keys: { p256dh: 'k1', auth: 'k2' },
        });
      });

      const first = yield* repo.revokeAccess(firmId, companyA, linkedA.id);
      expect(first).toEqual({ revoked: true });

      const effects = yield* Effect.promise(async () => ({
        contactRow: await db.select().from(contact).where(eq(contact.id, linkedA.id)),
        pushRows: await db
          .select()
          .from(pushSubscription)
          .where(eq(pushSubscription.contactId, linkedA.id)),
        linkRows: await db.select().from(uploadLink).where(eq(uploadLink.contactId, linkedA.id)),
        userRows: await db.select().from(authUser).where(eq(authUser.id, userId)),
      }));
      expect(effects.contactRow[0].authUserId).toBeNull();
      expect(effects.pushRows).toHaveLength(0);
      expect(effects.linkRows[0].revoked).toBe(true);
      expect(effects.userRows, 'vínculo B ainda vivo: user fica').toHaveLength(1);

      const second = yield* repo.revokeAccess(firmId, companyB, linkedB.id);
      expect(second).toEqual({ revoked: true });
      const userRows = yield* Effect.promise(() =>
        db.select().from(authUser).where(eq(authUser.id, userId)),
      );
      expect(userRows, 'último vínculo: user morre').toHaveLength(0);

      expect(yield* repo.revokeAccess(firmId, companyB, linkedB.id)).toEqual({ revoked: false });
      const ghost = '018f0000-0000-7000-8000-00000000dead';
      expect(yield* repo.revokeAccess(firmId, companyA, ghost)).toBeUndefined();
    }),
  );

  it.effect('findMembershipsByAuthUser e findUploadOwnership respeitam vínculo e atividade', () =>
    Effect.gen(function* () {
      const repo = yield* ContactsRepo;
      const firmId = yield* seedFirm('Firma M');
      const activeCompany = yield* seedCompany(firmId, 'M Ativa');
      const inactiveCompany = yield* seedCompany(firmId, 'M Inativa', false);
      const userId = yield* seedAuthUser('membro@example.com');
      const linked = yield* seedContact(activeCompany, {
        email: 'membro@example.com',
        authUserId: userId,
      });
      yield* seedContact(inactiveCompany, { email: 'membro@example.com', authUserId: userId });

      const memberships = yield* repo.findMembershipsByAuthUser(userId);
      expect(memberships).toMatchObject([
        { companyId: activeCompany, active: true },
        { companyId: inactiveCompany, active: false },
      ]);

      const requestId = yield* Effect.promise(async () => {
        const [row] = await db
          .insert(period)
          .values({ accountingFirmId: firmId, referenceMonth: '2026-02-01' })
          .returning({ id: period.id });
        const [req] = await db
          .insert(request)
          .values({ periodId: row.id, companyId: activeCompany })
          .returning({ id: request.id });

        return req.id;
      });

      expect(yield* repo.findUploadOwnership(userId, requestId)).toMatchObject({
        requestId,
        contactId: linked.id,
        active: true,
      });
      const strangerId = yield* seedAuthUser('estranho@example.com');
      expect(yield* repo.findUploadOwnership(strangerId, requestId)).toBeUndefined();

      expect(yield* repo.existsByAuthUser(userId)).toBe(true);
      expect(yield* repo.existsByAuthUser(strangerId)).toBe(false);
    }),
  );

  it.effect('openRequestsForEmail só devolve solicitação aberta de empresa ativa', () =>
    Effect.gen(function* () {
      const repo = yield* ContactsRepo;
      const firmId = yield* seedFirm('Firma O');
      const activeCompany = yield* seedCompany(firmId, 'O Ativa');
      const inactiveCompany = yield* seedCompany(firmId, 'O Inativa', false);
      const email = 'aberta@example.com';
      const opened = yield* seedContact(activeCompany, { email });
      yield* seedContact(inactiveCompany, { email });

      yield* Effect.promise(async () => {
        const [row] = await db
          .insert(period)
          .values({ accountingFirmId: firmId, referenceMonth: '2026-03-01' })
          .returning({ id: period.id });
        const [reqActive] = await db
          .insert(request)
          .values({ periodId: row.id, companyId: activeCompany })
          .returning({ id: request.id });
        await db.insert(request).values({
          periodId: row.id,
          companyId: inactiveCompany,
        });
        await db.insert(uploadLink).values({
          requestId: reqActive.id,
          contactId: opened.id,
          tokenHash: 'hash-aberta',
          expiresAt: new Date(Date.now() + 86_400_000),
        });
      });

      const rows = yield* repo.openRequestsForEmail(email);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        companyName: 'O Ativa',
        uploadLinkTokenHash: 'hash-aberta',
        hasAccess: null,
      });
    }),
  );

  it.effect('linkAuthUser, marcas de verificação e consultas de empresa', () =>
    Effect.gen(function* () {
      const repo = yield* ContactsRepo;
      const firmId = yield* seedFirm('Firma L');
      const otherFirmId = yield* seedFirm('Firma L2');
      const companyId = yield* seedCompany(firmId, 'L Ltda');
      const plain = yield* seedContact(companyId, { email: 'liga@example.com' });
      const userId = yield* seedAuthUser('liga@example.com');

      expect(yield* repo.linkAuthUser(plain.id, userId)).toEqual({ id: plain.id, companyId });

      yield* repo.markUserEmailVerified(userId);
      const [verified] = yield* Effect.promise(() =>
        db.select().from(authUser).where(eq(authUser.id, userId)),
      );
      expect(verified.emailVerified).toBe(true);
      const stamped = verified.termsAcceptedAt;
      expect(stamped).not.toBeNull();

      yield* repo.markTermsAccepted(userId);
      const [again] = yield* Effect.promise(() =>
        db.select().from(authUser).where(eq(authUser.id, userId)),
      );
      expect(again.termsAcceptedAt).toEqual(stamped);

      expect(yield* repo.findOwnedCompany(firmId, companyId)).toBe(true);
      expect(yield* repo.findOwnedCompany(otherFirmId, companyId)).toBe(false);

      expect(yield* repo.withAccess(firmId, companyId)).toMatchObject([
        { id: plain.id, email: 'liga@example.com' },
      ]);
      expect(yield* repo.contactsOf([companyId])).toHaveLength(1);
      expect(yield* repo.contactsOf([])).toEqual([]);
      expect(yield* repo.findByEmailInCompany(companyId, 'liga@example.com')).toMatchObject({
        id: plain.id,
        authUserId: userId,
      });
    }),
  );
});

import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountingFirm,
  company,
  contact,
  document,
  period,
  request,
  requestItem,
  subscription,
  uploadLink,
} from '../../src/infra/database/schema/index.js';
import { toUploadScope } from '../../src/modules/auth/scope.js';
import { hashToken } from '../../src/lib/token.js';
import { UploadLinksRepo } from '../../src/modules/requests/upload-link.repo.js';

let seq = 0;
const next = () => ++seq;

/** Firma + Empresa + Responsável + Competência + Solicitação + Link, tudo literal próprio. */
const openBox = (
  label: string,
  opts: { planName?: string; logoUrl?: string; active?: boolean } = {},
) =>
  Effect.gen(function* () {
    const tag = next();

    return yield* Effect.promise(async () => {
      const [firm] = await db
        .insert(accountingFirm)
        .values({
          name: `Firma ${label} ${tag}`,
          logoUrl: opts.logoUrl ?? 'https://logo.test/x.png',
        })
        .returning({ id: accountingFirm.id });

      if (opts.planName) {
        await db
          .insert(subscription)
          .values({ accountingFirmId: firm.id, planName: opts.planName });
      }

      const [companyRow] = await db
        .insert(company)
        .values({
          accountingFirmId: firm.id,
          name: `Empresa ${label} ${tag}`,
          active: opts.active ?? true,
        })
        .returning({ id: company.id });

      const [contactRow] = await db
        .insert(contact)
        .values({
          companyId: companyRow.id,
          name: `Resp ${label} ${tag}`,
          email: `resp-${label}-${tag}@example.com`,
        })
        .returning({ id: contact.id });

      const [periodRow] = await db
        .insert(period)
        .values({
          accountingFirmId: firm.id,
          referenceMonth: `20${20 + (tag % 50)}-0${1 + (tag % 9)}-01`,
          dueDate: '2030-04-10',
        })
        .returning({ id: period.id });

      const [requestRow] = await db
        .insert(request)
        .values({ periodId: periodRow.id, companyId: companyRow.id })
        .returning({ id: request.id });

      const token = `link-${label}-${tag}`;
      const [link] = await db
        .insert(uploadLink)
        .values({
          requestId: requestRow.id,
          contactId: contactRow.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        })
        .returning({ id: uploadLink.id });

      return {
        tag,
        firmId: firm.id,
        companyId: companyRow.id,
        contactId: contactRow.id,
        periodId: periodRow.id,
        requestId: requestRow.id,
        linkId: link.id,
        token,
        scope: toUploadScope(requestRow.id, contactRow.id),
      };
    });
  });

const rotateTo = (
  linkId: string,
  token: string,
  previousToken: string,
  previousExpiresAt: Date | null,
) =>
  Effect.promise(async () => {
    await db
      .update(uploadLink)
      .set({
        tokenHash: hashToken(token),
        previousTokenHash: hashToken(previousToken),
        previousExpiresAt,
      })
      .where(eq(uploadLink.id, linkId));
  });

layer(UploadLinksRepo.layer)('UploadLinksRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('findByTokenHash: resolve o token vigente e devolve o prazo dele', () =>
    Effect.gen(function* () {
      const repo = yield* UploadLinksRepo;
      const box = yield* openBox('vigente');

      const found = yield* repo.findByTokenHash(hashToken(box.token));
      expect(found).toMatchObject({
        requestId: box.requestId,
        contactId: box.contactId,
        revoked: false,
      });

      expect(yield* repo.findByTokenHash(hashToken('token-que-nunca-existiu'))).toBeUndefined();
    }),
  );

  it.effect('findByTokenHash: token anterior vale na carência e morre depois dela', () =>
    Effect.gen(function* () {
      const repo = yield* UploadLinksRepo;
      const box = yield* openBox('carencia');
      const grace = new Date(Date.now() + 2 * 3_600_000);
      yield* rotateTo(box.linkId, 'token-novo-carencia', box.token, grace);

      const inGrace = yield* repo.findByTokenHash(hashToken(box.token));
      expect(inGrace!.expiresAt.getTime()).toBe(grace.getTime());

      yield* rotateTo(box.linkId, 'token-novo-carencia', box.token, new Date(Date.now() - 1000));
      expect(yield* repo.findByTokenHash(hashToken(box.token))).toBeUndefined();
    }),
  );

  it.effect('findByTokenHash: Empresa inativa derruba o link', () =>
    Effect.gen(function* () {
      const repo = yield* UploadLinksRepo;
      const box = yield* openBox('inativa', { active: false });

      expect(yield* repo.findByTokenHash(hashToken(box.token))).toBeUndefined();
    }),
  );

  it.effect('findChecklist: agrupa documentos por Item, separa Extras e respeita o branding', () =>
    Effect.gen(function* () {
      const repo = yield* UploadLinksRepo;
      const box = yield* openBox('checklist', { planName: 'profissional' });

      const itemId = yield* Effect.promise(async () => {
        const [item] = await db
          .insert(requestItem)
          .values({
            requestId: box.requestId,
            name: `Extrato checklist ${box.tag}`,
            acceptedFormats: ['pdf'],
          })
          .returning({ id: requestItem.id });

        await db.insert(document).values([
          {
            requestId: box.requestId,
            requestItemId: item.id,
            storageKey: `unit/${box.requestId}/item.pdf`,
            fileName: 'item.pdf',
            contentType: 'application/pdf',
            sizeBytes: 10,
            uploadStatus: 'uploaded',
            reviewStatus: 'rejected',
            rejectionReason: 'Ilegível',
            uploadedAt: new Date(),
          },
          {
            requestId: box.requestId,
            storageKey: `unit/${box.requestId}/extra.pdf`,
            fileName: 'extra.pdf',
            contentType: 'application/pdf',
            sizeBytes: 10,
            uploadStatus: 'uploaded',
            reviewStatus: 'pending',
            uploadedAt: new Date(),
          },
          {
            requestId: box.requestId,
            requestItemId: item.id,
            storageKey: `unit/${box.requestId}/fantasma.pdf`,
            fileName: 'fantasma.pdf',
            contentType: 'application/pdf',
            sizeBytes: 10,
            uploadStatus: 'awaiting_upload',
          },
        ]);

        return item.id;
      });

      const checklist = yield* repo.findChecklist(box.scope);
      expect(checklist).toMatchObject({
        companyName: `Empresa checklist ${box.tag}`,
        status: 'open',
        periodDueDate: '2030-04-10',
        accountingFirmLogoUrl: 'https://logo.test/x.png',
      });
      expect(checklist!.items).toHaveLength(1);
      expect(checklist!.items[0].id).toBe(itemId);
      // presign sem arquivo no storage não aparece; nome de arquivo nunca sai daqui
      expect(checklist!.items[0].documents).toEqual([
        { requestItemId: itemId, reviewStatus: 'rejected', rejectionReason: 'Ilegível' },
      ]);
      expect(checklist!.extraDocuments).toEqual([
        { requestItemId: null, reviewStatus: 'pending', rejectionReason: null },
      ]);

      const unknown = yield* repo.findChecklist(
        toUploadScope('00000000-0000-7000-8000-000000000000', box.contactId),
      );
      expect(unknown).toBeUndefined();
    }),
  );

  it.effect('findChecklist: plano sem a capability `branding` não expõe o logo', () =>
    Effect.gen(function* () {
      const repo = yield* UploadLinksRepo;
      const box = yield* openBox('sembranding', { planName: 'essencial' });

      const checklist = yield* repo.findChecklist(box.scope);
      expect(checklist!.accountingFirmLogoUrl).toBeNull();
    }),
  );

  it.effect('findContact: dono do link, com o vínculo de conta quando existe', () =>
    Effect.gen(function* () {
      const repo = yield* UploadLinksRepo;
      const box = yield* openBox('dono');

      expect(yield* repo.findContact(box.scope)).toMatchObject({
        id: box.contactId,
        email: `resp-dono-${box.tag}@example.com`,
        authUserId: null,
      });

      const withoutContact = toUploadScope(box.requestId, '00000000-0000-7000-8000-000000000000');
      expect(yield* repo.findContact(withoutContact)).toBeUndefined();
    }),
  );
});

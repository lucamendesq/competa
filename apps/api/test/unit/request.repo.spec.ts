import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountant,
  cronLease,
  accountingFirm,
  company,
  contact,
  document,
  message,
  period,
  request,
  requestItem,
  subscription,
  uploadLink,
  user,
} from '../../src/infra/database/schema/index.js';
import { toContactScope, toFirmScope } from '../../src/modules/auth/scope.js';
import { NotFound } from '../../src/lib/app-error.js';
import { hashToken } from '../../src/lib/token.js';
import { InvalidTransition } from '../../src/modules/requests/errors.js';
import { RequestsRepo } from '../../src/modules/requests/request.repo.js';

let seq = 0;
const next = () => ++seq;

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedAccountant = (firmId: string, email: string) =>
  Effect.promise(async () => {
    const [authUser] = await db
      .insert(user)
      .values({ name: email, email, emailVerified: true })
      .returning({ id: user.id });

    const [row] = await db
      .insert(accountant)
      .values({ accountingFirmId: firmId, authUserId: authUser.id })
      .returning({ id: accountant.id });

    return row.id;
  });

const seedSubscription = (firmId: string, planName: string) =>
  Effect.promise(async () => {
    await db.insert(subscription).values({ accountingFirmId: firmId, planName });
  });

const seedCompany = (firmId: string, name: string, active = true) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(company)
      .values({ accountingFirmId: firmId, name, active })
      .returning({ id: company.id });

    return row.id;
  });

const seedContact = (companyId: string, name: string, email: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(contact)
      .values({ companyId, name, email })
      .returning({ id: contact.id });

    return row.id;
  });

const seedPeriod = (
  firmId: string,
  referenceMonth: string,
  opts: { dueDate?: string | null; status?: string } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(period)
      .values({
        accountingFirmId: firmId,
        referenceMonth,
        dueDate: opts.dueDate ?? null,
        status: opts.status ?? 'open',
      })
      .returning({ id: period.id });

    return row.id;
  });

const seedRequest = (periodId: string, companyId: string, status = 'open') =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(request)
      .values({ periodId, companyId, status })
      .returning({ id: request.id });

    return row.id;
  });

const seedItem = (
  requestId: string,
  name: string,
  opts: {
    status?: string;
    required?: boolean;
    dueDate?: string | null;
    acceptedFormats?: string[];
    deadlineNotifiedAt?: Date | null;
  } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(requestItem)
      .values({
        requestId,
        name,
        acceptedFormats: opts.acceptedFormats ?? ['pdf'],
        status: opts.status ?? 'pending',
        required: opts.required ?? true,
        dueDate: opts.dueDate ?? null,
        deadlineNotifiedAt: opts.deadlineNotifiedAt ?? null,
      })
      .returning({ id: requestItem.id });

    return row.id;
  });

const seedDocument = (
  requestId: string,
  opts: {
    requestItemId?: string | null;
    fileName?: string;
    reviewStatus?: string;
    uploadStatus?: string;
    uploadedByContactId?: string | null;
    sizeBytes?: number;
    uploadedAt?: Date | null;
  } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(document)
      .values({
        requestId,
        requestItemId: opts.requestItemId ?? null,
        storageKey: `unit/${requestId}/${opts.fileName ?? 'doc.pdf'}`,
        fileName: opts.fileName ?? 'doc.pdf',
        contentType: 'application/pdf',
        sizeBytes: opts.sizeBytes ?? 1024,
        uploadStatus: opts.uploadStatus ?? 'uploaded',
        reviewStatus: opts.reviewStatus ?? 'pending',
        uploadedByContactId: opts.uploadedByContactId ?? null,
        uploadedAt: opts.uploadedAt ?? new Date(),
      })
      .returning({ id: document.id });

    return row.id;
  });

const seedUploadLink = (
  requestId: string,
  contactId: string,
  opts: { token?: string; expiresAt?: Date } = {},
) =>
  Effect.promise(async () => {
    const token = opts.token ?? `tok-${requestId}`;
    const [row] = await db
      .insert(uploadLink)
      .values({
        requestId,
        contactId,
        tokenHash: hashToken(token),
        expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
      })
      .returning({ id: uploadLink.id });

    return { id: row.id, token };
  });

const seedMessage = (
  requestId: string,
  opts: { purpose?: string; status?: string; createdAt?: Date } = {},
) =>
  Effect.promise(async () => {
    await db.insert(message).values({
      requestId,
      channel: 'email',
      purpose: opts.purpose ?? 'reminder',
      recipient: 'dest@example.com',
      status: opts.status ?? 'sent',
      createdAt: opts.createdAt ?? new Date(),
    });
  });

/** Firma + Empresa + Responsável + Competência aberta + Solicitação aberta + Link. */
const openBox = (label: string, opts: { periodDueDate?: string | null } = {}) =>
  Effect.gen(function* () {
    const tag = next();
    const firmId = yield* seedFirm(`Firma ${label} ${tag}`);
    const accountantId = yield* seedAccountant(firmId, `rev-${label}-${tag}@example.com`);
    const companyId = yield* seedCompany(firmId, `Empresa ${label} ${tag}`);
    const contactId = yield* seedContact(
      companyId,
      `Resp ${label} ${tag}`,
      `resp-${label}-${tag}@example.com`,
    );
    const periodId = yield* seedPeriod(firmId, `20${20 + (tag % 50)}-0${1 + (tag % 9)}-01`, {
      dueDate: opts.periodDueDate === undefined ? '2030-01-10' : opts.periodDueDate,
    });
    const requestId = yield* seedRequest(periodId, companyId);
    const link = yield* seedUploadLink(requestId, contactId, { token: `tok-${label}-${tag}` });

    return { firmId, accountantId, companyId, contactId, periodId, requestId, link, tag };
  });

const linkRow = (requestId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select({
        tokenHash: uploadLink.tokenHash,
        previousTokenHash: uploadLink.previousTokenHash,
        previousExpiresAt: uploadLink.previousExpiresAt,
        contactId: uploadLink.contactId,
        expiresAt: uploadLink.expiresAt,
      })
      .from(uploadLink)
      .where(eq(uploadLink.requestId, requestId))
      .limit(1);

    return row;
  });

const itemRow = (itemId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select({
        status: requestItem.status,
        deadlineNotifiedAt: requestItem.deadlineNotifiedAt,
      })
      .from(requestItem)
      .where(eq(requestItem.id, itemId))
      .limit(1);

    return row;
  });

layer(RequestsRepo.layer)('RequestsRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect(
    'findById: monta itens com documentos, separa Extras e ignora presign sem arquivo',
    () =>
      Effect.gen(function* () {
        const repo = yield* RequestsRepo;
        const box = yield* openBox('find');
        const itemId = yield* seedItem(box.requestId, 'Extrato find');
        yield* seedDocument(box.requestId, { requestItemId: itemId, fileName: 'ok.pdf' });
        yield* seedDocument(box.requestId, { fileName: 'extra.pdf' });
        yield* seedDocument(box.requestId, {
          requestItemId: itemId,
          fileName: 'fantasma.pdf',
          uploadStatus: 'awaiting_upload',
        });

        const found = yield* repo.findById(box.firmId, box.requestId);
        expect(found!.companyId).toBe(box.companyId);
        expect(found!.items).toHaveLength(1);
        expect(found!.items[0].documents.map((row) => row.fileName)).toEqual(['ok.pdf']);
        expect(found!.extraDocuments.map((row) => row.fileName)).toEqual(['extra.pdf']);

        const otherFirm = yield* seedFirm(`Firma find alheia ${next()}`);
        expect(yield* repo.findById(otherFirm, box.requestId)).toBeUndefined();
      }),
  );

  it.effect(
    'acceptItem: aceita documentos pendentes, completa a Solicitação e recusa o 2º aceite',
    () =>
      Effect.gen(function* () {
        const repo = yield* RequestsRepo;
        const box = yield* openBox('accept');
        const itemId = yield* seedItem(box.requestId, 'Extrato accept', { status: 'submitted' });
        yield* seedDocument(box.requestId, { requestItemId: itemId });

        const accepted = yield* repo.acceptItem(box.firmId, itemId, box.accountantId);
        expect(accepted).toMatchObject({
          requestItemId: itemId,
          itemName: 'Extrato accept',
          acceptedDocuments: 1,
          requestStatus: 'complete',
          completed: true,
        });

        const again = yield* repo
          .acceptItem(box.firmId, itemId, box.accountantId)
          .pipe(Effect.flip);
        expect(again).toBeInstanceOf(InvalidTransition);
      }),
  );

  it.effect('rejectDocument: reabre o item, limpa a marca do cron e rotaciona o Link', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('reject');
      const itemId = yield* seedItem(box.requestId, 'Extrato reject', {
        status: 'submitted',
        deadlineNotifiedAt: new Date(),
      });
      const documentId = yield* seedDocument(box.requestId, { requestItemId: itemId });

      const before = yield* linkRow(box.requestId);
      const rejected = yield* repo.rejectDocument(
        box.firmId,
        documentId,
        'Página faltando',
        box.accountantId,
      );

      expect(rejected).toMatchObject({
        requestItemId: itemId,
        itemName: 'Extrato reject',
        rejectionReason: 'Página faltando',
        requestStatus: 'open',
      });
      expect(rejected!.token).toBeTruthy();

      expect(yield* itemRow(itemId)).toMatchObject({ status: 'pending', deadlineNotifiedAt: null });

      /* A resposta promete link rotacionado, então o anterior morre NA HORA — nada de 48h de
       * carência, que é regra do lembrete e do reenvio, não de um ato do Contador sobre o
       * link. `before` serve para provar que o token REALMENTE mudou. */
      const after = yield* linkRow(box.requestId);
      expect(after.tokenHash).toBe(hashToken(rejected!.token));
      expect(after.tokenHash).not.toBe(before.tokenHash);
      expect(after.previousTokenHash).toBeNull();
      expect(after.previousExpiresAt).toBeNull();
    }),
  );

  it.effect('applyReview: aceita, rejeita e revisa Extra em lote, com UM link rotacionado', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('lote');
      const acceptedItemId = yield* seedItem(box.requestId, 'Aceito lote', { status: 'submitted' });
      const rejectedItemId = yield* seedItem(box.requestId, 'Recusado lote', {
        status: 'submitted',
      });
      yield* seedDocument(box.requestId, { requestItemId: acceptedItemId });
      const toReject = yield* seedDocument(box.requestId, { requestItemId: rejectedItemId });
      const extraId = yield* seedDocument(box.requestId, { fileName: 'extra-lote.pdf' });

      const applied = yield* repo.applyReview(
        box.firmId,
        box.requestId,
        {
          acceptItemIds: [acceptedItemId],
          rejectDocuments: [{ documentId: toReject, rejectionReason: 'Ilegível' }],
          reviewExtras: [{ documentId: extraId, decision: 'accepted' }],
        },
        box.accountantId,
      );

      expect(applied).toMatchObject({ requestId: box.requestId, requestStatus: 'open' });
      expect(applied!.acceptedItemNames).toEqual(['Aceito lote']);
      expect(applied!.rejected).toEqual([
        { itemName: 'Recusado lote', rejectionReason: 'Ilegível' },
      ]);
      expect(applied!.token).toBeTruthy();
      expect((yield* itemRow(acceptedItemId)).status).toBe('accepted');
      expect((yield* itemRow(rejectedItemId)).status).toBe('pending');
    }),
  );

  it.effect('applyReview: id de fora da Solicitação é 404, não conflito', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('lote404');
      const otherRequestId = yield* seedRequest(
        box.periodId,
        yield* seedCompany(box.firmId, `Empresa lote404 vizinha ${next()}`),
      );
      const foreignItemId = yield* seedItem(otherRequestId, 'Item vizinho');

      const missing = yield* repo
        .applyReview(
          box.firmId,
          box.requestId,
          { acceptItemIds: [foreignItemId], rejectDocuments: [], reviewExtras: [] },
          box.accountantId,
        )
        .pipe(Effect.flip);

      expect(missing).toBeInstanceOf(NotFound);
    }),
  );

  it.effect('closeRequest: encerra contando pendências e recusa o segundo encerramento', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('close');
      yield* seedItem(box.requestId, 'Pendente close');
      yield* seedItem(box.requestId, 'Aceito close', { status: 'accepted' });

      const closed = yield* repo.closeRequest(box.firmId, box.requestId);
      expect(closed).toMatchObject({ status: 'closed', pendingItemCount: 1 });
      expect(closed!.closedAt).not.toBeNull();

      const again = yield* repo.closeRequest(box.firmId, box.requestId).pipe(Effect.flip);
      expect(again).toBeInstanceOf(InvalidTransition);
    }),
  );

  it.effect(
    'overdueItems: só vencidos de Competência/Solicitação abertas, com Link e contato',
    () =>
      Effect.gen(function* () {
        const repo = yield* RequestsRepo;
        const box = yield* openBox('prazo', { periodDueDate: '2024-01-10' });
        const lateId = yield* seedItem(box.requestId, 'Vencido prazo', { dueDate: '2024-01-05' });
        yield* seedItem(box.requestId, 'No prazo', { dueDate: '2099-12-31' });
        yield* seedItem(box.requestId, 'Ja aceito prazo', {
          dueDate: '2024-01-05',
          status: 'accepted',
        });

        const overdue = yield* repo.overdueItems(box.firmId, '2024-06-01');
        expect(overdue.map((row) => row.requestItemId)).toEqual([lateId]);
        expect(overdue[0]).toMatchObject({
          accountingFirmId: box.firmId,
          itemName: 'Vencido prazo',
          deadlineNotifiedAt: null,
        });

        // varredura do cron (escopo nulo) enxerga a mesma linha
        const scan = yield* repo.overdueItems(null, '2024-06-01');
        expect(scan.some((row) => row.requestItemId === lateId)).toBe(true);
      }),
  );

  it.effect('accountantEmails: agrupa por firma e devolve mapa vazio sem ids', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const tag = next();
      const firmId = yield* seedFirm(`Firma emails ${tag}`);
      yield* seedAccountant(firmId, `um-${tag}@example.com`);
      yield* seedAccountant(firmId, `dois-${tag}@example.com`);

      const byFirm = yield* repo.accountantEmails([firmId]);
      expect(byFirm.get(firmId)!.sort()).toEqual([
        `dois-${tag}@example.com`,
        `um-${tag}@example.com`,
      ]);

      expect((yield* repo.accountantEmails([])).size).toBe(0);
    }),
  );

  it.effect('applyUploadToken: grava o hash, guarda o anterior e troca o contato', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('apply');
      const otherContactId = yield* seedContact(
        box.companyId,
        `Outro apply ${box.tag}`,
        `outro-apply-${box.tag}@example.com`,
      );
      const before = yield* linkRow(box.requestId);

      const applied = yield* repo.applyUploadToken(
        box.requestId,
        hashToken('token-apply'),
        otherContactId,
      );
      expect(applied).toBe(true);

      const after = yield* linkRow(box.requestId);
      expect(after.tokenHash).toBe(hashToken('token-apply'));
      expect(after.previousTokenHash).toBe(before.tokenHash);
      expect(after.contactId).toBe(otherContactId);

      const revoked = yield* repo.applyUploadToken(
        box.requestId,
        hashToken('token-apply-2'),
        undefined,
        { revokePrevious: true },
      );
      expect(revoked).toBe(true);
      expect((yield* linkRow(box.requestId)).previousTokenHash).toBeNull();

      const semLink = yield* seedRequest(
        box.periodId,
        yield* seedCompany(box.firmId, `Empresa apply sem link ${next()}`),
      );
      expect(yield* repo.applyUploadToken(semLink, hashToken('nada'))).toBe(false);
    }),
  );

  it.effect('rotateUploadToken: devolve o token em claro e dá 48h de carência ao anterior', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('rotate');
      const before = yield* linkRow(box.requestId);

      const token = yield* repo.rotateUploadToken(box.requestId);
      expect(token).toBeTruthy();

      const after = yield* linkRow(box.requestId);
      expect(after.tokenHash).toBe(hashToken(token!));
      expect(after.previousTokenHash).toBe(before.tokenHash);
      expect(after.previousExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 48 * 3_600_000);

      const semLink = yield* seedRequest(
        box.periodId,
        yield* seedCompany(box.firmId, `Empresa rotate sem link ${next()}`),
      );
      expect(yield* repo.rotateUploadToken(semLink)).toBeUndefined();
    }),
  );

  it.effect('uploadLinkContext: dados do reenvio, nunca de outra Contabilidade', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('ctx');

      const context = yield* repo.uploadLinkContext(box.firmId, box.requestId);
      expect(context).toMatchObject({
        requestStatus: 'open',
        periodDueDate: '2030-01-10',
        contactEmail: `resp-ctx-${box.tag}@example.com`,
      });

      const otherFirm = yield* seedFirm(`Firma ctx alheia ${next()}`);
      expect(yield* repo.uploadLinkContext(otherFirm, box.requestId)).toBeUndefined();
    }),
  );

  it.effect('rotateUploadLink: devolve contexto + token novo e recusa Solicitação encerrada', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('rotlink');

      const rotated = yield* repo.rotateUploadLink(box.firmId, box.requestId);
      expect(rotated).toMatchObject({ requestStatus: 'open' });
      expect(rotated!.token).toBeTruthy();

      yield* repo.closeRequest(box.firmId, box.requestId);
      const closed = yield* repo.rotateUploadLink(box.firmId, box.requestId).pipe(Effect.flip);
      expect(closed).toBeInstanceOf(InvalidTransition);
    }),
  );

  it.effect('markDeadlineNotified: carimba os itens e é no-op com lista vazia', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('marca');
      const itemId = yield* seedItem(box.requestId, 'Item marca');

      yield* repo.markDeadlineNotified([]);
      expect((yield* itemRow(itemId)).deadlineNotifiedAt).toBeNull();

      yield* repo.markDeadlineNotified([itemId]);
      expect((yield* itemRow(itemId)).deadlineNotifiedAt).not.toBeNull();
    }),
  );

  it.effect('documentsForRequestZip: cabeçalho da Empresa e só o que chegou ao storage', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('zipreq');
      const itemId = yield* seedItem(box.requestId, 'Item zipreq');
      yield* seedDocument(box.requestId, { requestItemId: itemId, fileName: 'no-zip.pdf' });
      yield* seedDocument(box.requestId, {
        fileName: 'fora-do-zip.pdf',
        uploadStatus: 'awaiting_upload',
      });

      const found = yield* repo.documentsForRequestZip(box.firmId, box.requestId);
      expect(found!.companyName).toBe(`Empresa zipreq ${box.tag}`);
      expect(found!.documents.map((row) => row.fileName)).toEqual(['no-zip.pdf']);

      const otherFirm = yield* seedFirm(`Firma zipreq alheia ${next()}`);
      expect(yield* repo.documentsForRequestZip(otherFirm, box.requestId)).toBeUndefined();
    }),
  );

  it.effect('documentForRead: alcança pelo escopo da firma e pelo do Responsável', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('read');
      const documentId = yield* seedDocument(box.requestId, { fileName: 'leitura.pdf' });
      const contactScope = toContactScope([{ contactId: box.contactId, companyId: box.companyId }]);

      expect(yield* repo.documentForRead(box.firmId, documentId)).toMatchObject({
        fileName: 'leitura.pdf',
        contentType: 'application/pdf',
      });
      expect(yield* repo.documentForRead(contactScope, documentId)).toMatchObject({
        fileName: 'leitura.pdf',
      });

      const otherFirm = yield* seedFirm(`Firma read alheia ${next()}`);
      expect(yield* repo.documentForRead(otherFirm, documentId)).toBeUndefined();
    }),
  );

  it.effect('pending: itens das Empresas do Responsável com o histórico de recusas', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('pend');
      const itemId = yield* seedItem(box.requestId, 'Item pend', { dueDate: '2030-02-01' });
      yield* seedDocument(box.requestId, {
        requestItemId: itemId,
        fileName: 'recusado.pdf',
        reviewStatus: 'rejected',
      });
      const scope = toContactScope([{ contactId: box.contactId, companyId: box.companyId }]);

      const rows = yield* repo.pending(scope);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ itemId, itemName: 'Item pend', requestStatus: 'open' });
      expect(rows[0].rejections).toEqual([{ fileName: 'recusado.pdf', rejectionReason: null }]);

      yield* repo.closeRequest(box.firmId, box.requestId);
      expect(yield* repo.pending(scope)).toEqual([]);
    }),
  );

  it.effect('documentsForPeriodZip: varre as Solicitações da Competência da própria firma', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('zipper');
      yield* seedDocument(box.requestId, { fileName: 'da-competencia.pdf' });

      const found = yield* repo.documentsForPeriodZip(box.firmId, box.periodId);
      expect(found!.documents.map((row) => row.fileName)).toEqual(['da-competencia.pdf']);

      const otherFirm = yield* seedFirm(`Firma zipper alheia ${next()}`);
      expect(yield* repo.documentsForPeriodZip(otherFirm, box.periodId)).toBeUndefined();
    }),
  );

  it.effect('reviewExtraDocument: decide o Extra e recusa documento de Item', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('extra');
      const extraId = yield* seedDocument(box.requestId, { fileName: 'extra-unit.pdf' });

      /* Quirk congelado #18: no unitário, `accepted` com `rejectionReason` GRAVA a reason
       * (o lote anula). */
      const reviewed = yield* repo.reviewExtraDocument(
        box.firmId,
        extraId,
        { reviewStatus: 'accepted', rejectionReason: 'motivo que fica' },
        box.accountantId,
      );
      expect(reviewed).toMatchObject({
        reviewStatus: 'accepted',
        rejectionReason: 'motivo que fica',
      });

      const itemId = yield* seedItem(box.requestId, 'Item extra');
      const ofItem = yield* seedDocument(box.requestId, { requestItemId: itemId });
      const refused = yield* repo
        .reviewExtraDocument(box.firmId, ofItem, { reviewStatus: 'accepted' }, box.accountantId)
        .pipe(Effect.flip);
      expect(refused).toBeInstanceOf(InvalidTransition);
    }),
  );

  it.effect('undoAcceptItem: devolve o item para submitted e reverte os documentos', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('undo');
      const itemId = yield* seedItem(box.requestId, 'Item undo', { status: 'submitted' });
      yield* seedDocument(box.requestId, { requestItemId: itemId });
      yield* repo.acceptItem(box.firmId, itemId, box.accountantId);

      const undone = yield* repo.undoAcceptItem(box.firmId, itemId);
      expect(undone).toMatchObject({
        requestItemId: itemId,
        itemStatus: 'submitted',
        revertedDocuments: 1,
        requestStatus: 'open',
      });

      const again = yield* repo.undoAcceptItem(box.firmId, itemId).pipe(Effect.flip);
      expect(again).toBeInstanceOf(InvalidTransition);
    }),
  );

  it.effect('reminderCandidates: agrupa pendências por Solicitação com destinatário e stats', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const box = yield* openBox('lembra');
      yield* seedItem(box.requestId, 'Pendente lembra', { dueDate: '2030-03-01' });
      yield* seedItem(box.requestId, 'Aceito lembra', { status: 'accepted' });
      yield* seedMessage(box.requestId, { purpose: 'reminder', status: 'sent' });
      yield* seedMessage(box.requestId, { purpose: 'reminder', status: 'failed' });

      const candidates = yield* repo.reminderCandidates(box.firmId);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        requestId: box.requestId,
        accountingFirmId: box.firmId,
        contactEmail: `resp-lembra-${box.tag}@example.com`,
        reminderCount: 1,
      });
      expect(candidates[0].pendingItems.map((row) => row.name)).toEqual(['Pendente lembra']);
    }),
  );

  it.effect('reminderSettingsByFirm: aplica os knobs só no plano com a capability', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const tag = next();
      const tunedId = yield* seedFirm(`Firma tuned ${tag}`);
      const defaultedId = yield* seedFirm(`Firma defaulted ${tag}`);
      yield* Effect.promise(async () => {
        await db
          .update(accountingFirm)
          .set({ reminderMax: 7, reminderDueSoonDays: 9, reminderGapDays: 5 })
          .where(eq(accountingFirm.id, tunedId));
        await db
          .update(accountingFirm)
          .set({ reminderMax: 7, reminderDueSoonDays: 9, reminderGapDays: 5 })
          .where(eq(accountingFirm.id, defaultedId));
      });
      yield* seedSubscription(tunedId, 'escritorio');
      yield* seedSubscription(defaultedId, 'essencial');

      const settings = yield* repo.reminderSettingsByFirm([tunedId, defaultedId]);
      expect(settings.get(tunedId)).toEqual({
        reminderMax: 7,
        reminderDueSoonDays: 9,
        reminderGapDays: 5,
      });
      expect(settings.get(defaultedId)).toEqual({
        reminderMax: 2,
        reminderDueSoonDays: 3,
        reminderGapDays: 3,
      });

      expect((yield* repo.reminderSettingsByFirm([])).size).toBe(0);
    }),
  );

  it.effect('withLease: roda, libera no fim e recusa enquanto outra instância segura', () =>
    Effect.gen(function* () {
      const repo = yield* RequestsRepo;
      const name = `sweep-${next()}`;

      expect(yield* repo.withLease(name, async () => 'rodou')).toBe('rodou');
      // liberada no fim: a segunda chamada seguida também roda
      expect(yield* repo.withLease(name, async () => 'de novo')).toBe('de novo');

      // outra instância com a lease em dia: pulamos
      yield* Effect.promise(() =>
        db
          .update(cronLease)
          .set({ holder: 'outra-instancia', expiresAt: new Date(Date.now() + 60_000) })
          .where(eq(cronLease.name, name)),
      );

      let ran = false;
      const skipped = yield* repo.withLease(name, async () => {
        ran = true;
        return 'nao deveria';
      });
      expect(skipped).toBeNull();
      expect(ran).toBe(false);

      /* O que o `pg_advisory_lock` não dava: lease vencida se cura sozinha. Antes, o unlock
       * caía numa conexão diferente da do lock e o vazamento era permanente — toda varredura
       * seguinte era pulada em silêncio. */
      yield* Effect.promise(() =>
        db
          .update(cronLease)
          .set({ expiresAt: new Date(Date.now() - 1_000) })
          .where(eq(cronLease.name, name)),
      );

      expect(yield* repo.withLease(name, async () => 'retomada')).toBe('retomada');
    }),
  );
});

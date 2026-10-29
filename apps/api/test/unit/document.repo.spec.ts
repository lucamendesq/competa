import { layer } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import env from '../../src/config/env.js';
import {
  accountingFirm,
  company,
  contact,
  document,
  period,
  request,
  requestItem,
} from '../../src/infra/database/schema/index.js';
import { toUploadScope } from '../../src/modules/auth/scope.js';
import { NotFound, ValidationError } from '../../src/lib/app-error.js';
import { DocumentsRepo } from '../../src/modules/requests/document.repo.js';

let seq = 0;
const next = () => ++seq;

/** PDF mínimo: o `fileTypeFromBuffer` da confirmação precisa reconhecer o magic number. */
const pdf = (marker: string) => Buffer.from(`%PDF-1.4\n% ${marker}\n%%EOF\n`);

const openBox = (label: string, opts: { requestStatus?: string } = {}) =>
  Effect.gen(function* () {
    const tag = next();

    return yield* Effect.promise(async () => {
      const [firm] = await db
        .insert(accountingFirm)
        .values({ name: `Firma ${label} ${tag}` })
        .returning({ id: accountingFirm.id });

      const [companyRow] = await db
        .insert(company)
        .values({ accountingFirmId: firm.id, name: `Empresa ${label} ${tag}` })
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
          dueDate: '2030-05-10',
        })
        .returning({ id: period.id });

      const [requestRow] = await db
        .insert(request)
        .values({
          periodId: periodRow.id,
          companyId: companyRow.id,
          status: opts.requestStatus ?? 'open',
        })
        .returning({ id: request.id });

      const [item] = await db
        .insert(requestItem)
        .values({
          requestId: requestRow.id,
          name: `Extrato ${label} ${tag}`,
          acceptedFormats: ['pdf'],
        })
        .returning({ id: requestItem.id });

      return {
        tag,
        firmId: firm.id,
        companyId: companyRow.id,
        contactId: contactRow.id,
        periodId: periodRow.id,
        requestId: requestRow.id,
        itemId: item.id,
        scope: toUploadScope(requestRow.id, contactRow.id),
      };
    });
  });

const storageKeyOf = (documentId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select({ storageKey: document.storageKey })
      .from(document)
      .where(eq(document.id, documentId))
      .limit(1);

    return row.storageKey;
  });

/** Escreve de verdade no diretório do LocalStorage — a confirmação lê o arquivo e o hasheia. */
const putFile = (storageKey: string, content: Buffer) =>
  Effect.promise(async () => {
    const path = join(resolve(env.STORAGE_LOCAL_DIR), storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  });

const documentRows = (requestId: string) =>
  Effect.promise(async () =>
    db
      .select({
        id: document.id,
        uploadStatus: document.uploadStatus,
        sizeBytes: document.sizeBytes,
        checksum: document.checksum,
      })
      .from(document)
      .where(eq(document.requestId, requestId)),
  );

const itemStatus = (itemId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select({ status: requestItem.status })
      .from(requestItem)
      .where(eq(requestItem.id, itemId))
      .limit(1);

    return row.status;
  });

const seedAwaiting = (requestId: string, fileName: string, sizeBytes: number) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(document)
      .values({
        requestId,
        storageKey: `unit-doc/${requestId}/${fileName}`,
        fileName,
        contentType: 'application/pdf',
        sizeBytes,
        uploadStatus: 'awaiting_upload',
      })
      .returning({ id: document.id, storageKey: document.storageKey });

    return row;
  });

layer(DocumentsRepo.layer)('DocumentsRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('presign: reserva a linha, assina a URL e recusa o arquivo fora das regras', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('presign');

      const result = yield* repo.presign(box.scope, {
        requestItemId: box.itemId,
        files: [
          { fileName: 'nota.pdf', contentType: 'application/pdf', sizeBytes: 120 },
          { fileName: 'planilha.ods', contentType: 'application/pdf', sizeBytes: 120 },
          { fileName: 'vazio.pdf', contentType: 'application/pdf', sizeBytes: 0 },
        ],
      });

      expect(result.files).toHaveLength(3);
      expect(result.files[0]).toMatchObject({ fileName: 'nota.pdf', accepted: true });
      expect(result.files[0].uploadUrl).toContain('/storage/local/');
      expect(result.files[1]).toMatchObject({ fileName: 'planilha.ods', accepted: false });
      expect(result.files[2]).toMatchObject({
        fileName: 'vazio.pdf',
        accepted: false,
        reason: 'Arquivo vazio (0 bytes).',
      });

      const rows = yield* documentRows(box.requestId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: result.files[0].documentId,
        uploadStatus: 'awaiting_upload',
      });
    }),
  );

  it.effect('presign: recusa lote acima do teto, Solicitação inexistente e Item de fora', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('presign422');

      const tooMany = yield* repo
        .presign(box.scope, {
          files: Array.from({ length: 501 }, (_, index) => ({
            fileName: `lote-${index}.pdf`,
            contentType: 'application/pdf',
            sizeBytes: 10,
          })),
        })
        .pipe(Effect.flip);
      expect(tooMany).toBeInstanceOf(ValidationError);

      const unknownRequest = yield* repo
        .presign(toUploadScope('00000000-0000-7000-8000-000000000000', box.contactId), {
          files: [{ fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
        })
        .pipe(Effect.flip);
      expect(unknownRequest).toBeInstanceOf(NotFound);

      const unknownItem = yield* repo
        .presign(box.scope, {
          requestItemId: '00000000-0000-7000-8000-000000000000',
          files: [{ fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
        })
        .pipe(Effect.flip);
      expect(unknownItem).toBeInstanceOf(NotFound);
    }),
  );

  it.effect('presign: Solicitação encerrada não aceita envio por Item', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('presignfechada', { requestStatus: 'closed' });

      const refused = yield* repo
        .presign(box.scope, {
          requestItemId: box.itemId,
          files: [{ fileName: 'tarde.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
        })
        .pipe(Effect.flip);
      expect(refused).toBeInstanceOf(ValidationError);

      // como Extra continua passando: a Solicitação encerrada só fecha os Itens
      const asExtra = yield* repo.presign(box.scope, {
        files: [{ fileName: 'extra.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
      });
      expect(asExtra.files[0].accepted).toBe(true);
    }),
  );

  it.effect('confirm: marca uploaded, grava checksum/tamanho real e submete o Item', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('confirm');
      const content = pdf(`confirm ${box.tag}`);

      const presigned = yield* repo.presign(box.scope, {
        requestItemId: box.itemId,
        files: [
          { fileName: 'nota.pdf', contentType: 'application/pdf', sizeBytes: content.length },
        ],
      });
      const documentId = presigned.files[0].documentId!;
      yield* putFile(yield* storageKeyOf(documentId), content);

      const confirmed = yield* repo.confirm(box.scope, [documentId]);
      expect(confirmed).toMatchObject({
        confirmed: 1,
        submittedItemIds: [box.itemId],
        refused: [],
      });

      const rows = yield* documentRows(box.requestId);
      expect(rows[0]).toMatchObject({ uploadStatus: 'uploaded', sizeBytes: content.length });
      expect(rows[0].checksum).toBeTruthy();
      expect(yield* itemStatus(box.itemId)).toBe('submitted');
    }),
  );

  it.effect('confirm: o mesmo documento em paralelo confirma uma vez só; o outro é 404', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('confirmparalelo');
      const content = pdf(`paralelo ${box.tag}`);

      const presigned = yield* repo.presign(box.scope, {
        requestItemId: box.itemId,
        files: [
          { fileName: 'nota.pdf', contentType: 'application/pdf', sizeBytes: content.length },
        ],
      });
      const documentId = presigned.files[0].documentId!;
      yield* putFile(yield* storageKeyOf(documentId), content);

      const [first, second] = yield* Effect.all(
        [
          Effect.exit(repo.confirm(box.scope, [documentId])),
          Effect.exit(repo.confirm(box.scope, [documentId])),
        ],
        { concurrency: 'unbounded' },
      );

      const outcomes = [first, second].map((exit) =>
        Exit.isSuccess(exit) ? exit.value.confirmed : 'falhou',
      );
      expect(outcomes.sort()).toEqual([1, 'falhou']);
      const failed = [first, second].find(Exit.isFailure)!;
      expect(Cause.squash(failed.cause)).toBeInstanceOf(NotFound);

      const rows = yield* documentRows(box.requestId);
      expect(rows).toEqual([
        expect.objectContaining({ uploadStatus: 'uploaded', sizeBytes: content.length }),
      ]);
    }),
  );

  it.effect('confirm: arquivo que não chegou ao storage é recusado e a reserva fica', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('confirmfalta');

      const presigned = yield* repo.presign(box.scope, {
        files: [{ fileName: 'sumiu.pdf', contentType: 'application/pdf', sizeBytes: 42 }],
      });
      const documentId = presigned.files[0].documentId!;

      const confirmed = yield* repo.confirm(box.scope, [documentId]);
      expect(confirmed.confirmed).toBe(0);
      expect(confirmed.refused).toEqual([
        { documentId, fileName: 'sumiu.pdf', reason: 'Arquivo não chegou ao storage.' },
      ]);
      /* A varredura de reservas vencidas apaga a linha e o objeto que um PUT atrasado criar. */
      expect(yield* documentRows(box.requestId)).toEqual([
        expect.objectContaining({ uploadStatus: 'awaiting_upload' }),
      ]);
    }),
  );

  it.effect('confirm: lote sem nenhuma reserva viva é 404', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('confirm404');

      const missing = yield* repo
        .confirm(box.scope, ['00000000-0000-7000-8000-000000000000'])
        .pipe(Effect.flip);
      expect(missing).toBeInstanceOf(NotFound);
    }),
  );

  it.effect('uploadContext: devolve firma/competência e o Item quando pedido', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('contexto');

      const withoutItem = yield* repo.uploadContext(box.scope);
      expect(withoutItem).toMatchObject({ status: 'open', accountingFirmId: box.firmId });
      expect(withoutItem!.item).toBeUndefined();

      const withItem = yield* repo.uploadContext(box.scope, box.itemId);
      expect(withItem!.item).toMatchObject({ id: box.itemId, acceptedFormats: ['pdf'] });

      const unknown = yield* repo.uploadContext(
        toUploadScope('00000000-0000-7000-8000-000000000000', box.contactId),
      );
      expect(unknown).toBeUndefined();
    }),
  );

  it.effect('createMany: grava as linhas já carimbadas com a Solicitação e o Responsável', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('createmany');

      yield* repo.createMany(box.scope, [
        {
          id: '01999999-0000-7000-8000-00000000c001',
          requestItemId: box.itemId,
          storageKey: `unit-doc/${box.requestId}/lote.pdf`,
          fileName: 'lote.pdf',
          contentType: 'application/pdf',
          sizeBytes: 77,
        },
      ]);

      const rows = yield* Effect.promise(async () =>
        db
          .select({
            id: document.id,
            requestId: document.requestId,
            uploadedByContactId: document.uploadedByContactId,
            uploadStatus: document.uploadStatus,
          })
          .from(document)
          .where(eq(document.requestId, box.requestId)),
      );
      expect(rows).toEqual([
        {
          id: '01999999-0000-7000-8000-00000000c001',
          requestId: box.requestId,
          uploadedByContactId: box.contactId,
          uploadStatus: 'awaiting_upload',
        },
      ]);
    }),
  );

  it.effect('pendingUpload: só reservas da Solicitação do escopo e ainda não confirmadas', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('pendupload');
      const awaiting = yield* seedAwaiting(box.requestId, 'reserva.pdf', 50);
      const uploaded = yield* seedAwaiting(box.requestId, 'ja-subiu.pdf', 50);
      yield* Effect.promise(async () => {
        await db
          .update(document)
          .set({ uploadStatus: 'uploaded', uploadedAt: new Date() })
          .where(eq(document.id, uploaded.id));
      });

      const pending = yield* repo.pendingUpload(box.scope, [awaiting.id, uploaded.id]);
      expect(pending).toEqual([
        {
          id: awaiting.id,
          storageKey: awaiting.storageKey,
          fileName: 'reserva.pdf',
          contentType: 'application/pdf',
          requestItemId: null,
          declaredBytes: 50,
        },
      ]);
    }),
  );

  it.effect('discard: apaga as linhas pedidas e é no-op com lista vazia', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('discard');
      const first = yield* seedAwaiting(box.requestId, 'some.pdf', 10);
      const second = yield* seedAwaiting(box.requestId, 'fica.pdf', 10);

      yield* repo.discard([]);
      expect(yield* documentRows(box.requestId)).toHaveLength(2);

      yield* repo.discard([first.id]);
      expect((yield* documentRows(box.requestId)).map((row) => row.id)).toEqual([second.id]);
    }),
  );

  it.effect('staleAwaitingUpload: só reservas velhas, nunca o que já chegou ao storage', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('stale');
      const old = yield* seedAwaiting(box.requestId, 'velha.pdf', 10);
      const fresh = yield* seedAwaiting(box.requestId, 'nova.pdf', 10);
      const uploaded = yield* seedAwaiting(box.requestId, 'confirmada.pdf', 10);
      yield* Effect.promise(async () => {
        await db
          .update(document)
          .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
          .where(inArray(document.id, [old.id, uploaded.id]));
        await db
          .update(document)
          .set({ uploadStatus: 'uploaded', uploadedAt: new Date() })
          .where(eq(document.id, uploaded.id));
      });

      const stale = yield* repo.staleAwaitingUpload(new Date('2021-01-01T00:00:00Z'));
      const ids = stale.map((row) => row.id);
      expect(ids).toContain(old.id);
      expect(ids).not.toContain(fresh.id);
      expect(ids).not.toContain(uploaded.id);
    }),
  );

  it.effect('expiredFiscalDocuments: pega por idade e respeita o limite', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('expurgo');
      const first = yield* seedAwaiting(box.requestId, 'antiga-1.pdf', 10);
      const second = yield* seedAwaiting(box.requestId, 'antiga-2.pdf', 10);
      yield* Effect.promise(async () => {
        await db
          .update(document)
          .set({ createdAt: new Date('2015-01-01T00:00:00Z') })
          .where(inArray(document.id, [first.id, second.id]));
      });

      const expired = yield* repo.expiredFiscalDocuments(new Date('2016-01-01T00:00:00Z'));
      expect(expired.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());

      const capped = yield* repo.expiredFiscalDocuments(new Date('2016-01-01T00:00:00Z'), 1);
      expect(capped).toHaveLength(1);
    }),
  );

  it.effect('purgeFiscalDocuments: apaga os ids dados e é no-op com lista vazia', () =>
    Effect.gen(function* () {
      const repo = yield* DocumentsRepo;
      const box = yield* openBox('purge');
      const first = yield* seedAwaiting(box.requestId, 'purga-1.pdf', 10);
      const second = yield* seedAwaiting(box.requestId, 'purga-2.pdf', 10);

      yield* repo.purgeFiscalDocuments([]);
      expect(yield* documentRows(box.requestId)).toHaveLength(2);

      yield* repo.purgeFiscalDocuments([first.id]);
      expect((yield* documentRows(box.requestId)).map((row) => row.id)).toEqual([second.id]);
    }),
  );
});

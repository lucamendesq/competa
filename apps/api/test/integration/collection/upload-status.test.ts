import type { INestApplication } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { subHours } from 'date-fns';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import env from '../../../src/config/env.js';
import { document } from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { DeadlineCron } from '../../../src/modules/requests/deadline.cron.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** `upload_status`: presign cria a linha, só a confirmação a torna real, e a faxina
 *  diária apaga o que nunca foi confirmado. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3979);
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
});

const setup = async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const token = opened.tokenFor('Padaria Central');
  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const items = checklist.body.data.items as { id: string; name: string }[];

  return {
    session,
    token,
    requestId: opened.requests[0].id,
    periodId: opened.id,
    statementId: items.find((row) => row.name === CATALOG.extrato_bancario.name)!.id,
  };
};

/** Presign + PUT sem confirmar: linha `awaiting_upload` com objeto no disco. */
const uploadWithoutConfirming = async (token: string, requestItemId?: string) => {
  const content = '%PDF sem confirmacao';
  const presign = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      ...(requestItemId ? { requestItemId } : {}),
      files: [
        {
          fileName: 'extrato.pdf',
          contentType: 'application/pdf',
          sizeBytes: Buffer.byteLength(content),
        },
      ],
    })
    .expect(201);

  const entry = presign.body.data.files[0] as {
    documentId: string;
    storageKey: string;
    uploadUrl: string;
  };
  const url = new URL(entry.uploadUrl);
  await http(app)
    .put(url.pathname + url.search)
    .set('content-type', 'application/pdf')
    .send(Buffer.from(content));

  return entry;
};

const exists = async (storageKey: string) =>
  stat(resolve(env.STORAGE_LOCAL_DIR, storageKey))
    .then(() => true)
    .catch(() => false);

test('a linha nasce awaiting_upload, com uploaded_at nulo e invisível nas leituras', async () => {
  const { token, session, requestId, periodId, statementId } = await setup();
  await uploadWithoutConfirming(token, statementId);

  const [row] = await db.select().from(document);
  expect(row.uploadStatus).toBe('awaiting_upload');
  expect(row.uploadedAt).toBeNull();

  const panel = await http(app)
    .get(`/requests/${requestId}`)
    .set('cookie', session.cookie)
    .expect(200);
  expect(panel.body.data.items.flatMap((item: { documents: [] }) => item.documents)).toEqual([]);
  expect(panel.body.data.items.find((item: { id: string }) => item.id === statementId).status).toBe(
    'pending',
  );

  const pending = await http(app)
    .get(`/periods/${periodId}/pending-panel`)
    .set('cookie', session.cookie)
    .expect(200);
  expect(JSON.stringify(pending.body.data)).not.toContain('extrato.pdf');

  const publico = await http(app).get(`/upload/${token}`).expect(200);
  expect(
    (publico.body.data.items as { id: string; status: string }[]).find(
      (item) => item.id === statementId,
    )!.status,
  ).toBe('pending');
});

test('a confirmação marca uploaded e preenche uploaded_at', async () => {
  const { token, statementId } = await setup();

  const result = await uploadFile(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: statementId,
  });
  expect(result.accepted).toBe(true);
  if (!result.accepted) return;

  const [row] = await db.select().from(document).where(eq(document.id, result.documentId));
  expect(row.uploadStatus).toBe('uploaded');
  expect(row.uploadedAt).not.toBeNull();
});

test('a faxina apaga linha e objeto do envio não confirmado com mais de 24h', async () => {
  const { token, statementId } = await setup();
  const stale = await uploadWithoutConfirming(token, statementId);
  await db
    .update(document)
    .set({ createdAt: subHours(new Date(), 30) })
    .where(eq(document.id, stale.documentId));

  const discarded = await app.get(DeadlineCron).discardStaleUploads();

  expect(discarded).toBe(1);
  expect(await db.select().from(document)).toHaveLength(0);
  expect(await exists(stale.storageKey)).toBe(false);
});

test('a faxina não toca no que foi confirmado nem no envio recém-criado', async () => {
  const { token, statementId } = await setup();

  const confirmado = await uploadFile(app, token, {
    fileName: 'confirmado.pdf',
    requestItemId: statementId,
  });
  expect(confirmado.accepted).toBe(true);
  if (!confirmado.accepted) return;
  // confirmado, mas antigo: idade não pode apagar envio válido
  await db
    .update(document)
    .set({ createdAt: subHours(new Date(), 30) })
    .where(eq(document.id, confirmado.documentId));

  const recente = await uploadWithoutConfirming(token, statementId);

  const discarded = await app.get(DeadlineCron).discardStaleUploads();

  expect(discarded).toBe(0);
  const rows = await db.select().from(document);
  expect(rows.map((row) => row.id).sort()).toEqual(
    [confirmado.documentId, recente.documentId].sort(),
  );
  expect(await exists(recente.storageKey)).toBe(true);
});

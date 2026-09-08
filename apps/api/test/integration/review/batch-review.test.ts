import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { uploadLink } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  captureEvent,
  drainDeliveries,
  itemsOf,
  messagesOf,
  presignOnly,
  requestPanel,
  resetRateLimit,
  setupReview,
  uploadOk,
  waitForMessages,
} from './helpers.js';
import { spyProvider } from '../messaging/provider-spy.js';

/** Revisão em lote: o Contador decide a tela inteira e publica de uma vez. A razão de
 *  existir é o email — cinco rejeições mandavam cinco emails ao Responsável. */

let app: INestApplication;
let provider: ReturnType<typeof spyProvider>;

beforeAll(async () => {
  app = await createTestApp();
  provider = spyProvider(app);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await drainDeliveries();
  await resetDatabase();
  resetRateLimit(app);
  provider.reset();
});

const hashOf = async (requestId: string) => {
  const [row] = await db
    .select({ tokenHash: uploadLink.tokenHash })
    .from(uploadLink)
    .where(eq(uploadLink.requestId, requestId));

  return row.tokenHash;
};

/** Sobe um arquivo em cada Item da Solicitação. */
const fillEveryItem = async (
  app: INestApplication,
  cookie: string,
  requestId: string,
  token: string,
) => {
  const items = await itemsOf(app, cookie, requestId);
  const documents: { itemId: string; itemName: string; documentId: string }[] = [];

  for (const item of items) {
    documents.push({
      itemId: item.id,
      itemName: item.name,
      documentId: await uploadOk(app, token, {
        fileName: `${item.name}.pdf`,
        requestItemId: item.id,
      }),
    });
  }

  return documents;
};

const publish = (app: INestApplication, cookie: string, requestId: string, body: object) =>
  http(app).post(`/requests/${requestId}/review`).set('cookie', cookie).send(body);

test('três rejeições num lote geram UM email, com os três motivos e um link novo', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const documents = await fillEveryItem(app, cookie, requestId, token);
  const rejected = documents.slice(0, 3);

  const hashBefore = await hashOf(requestId);
  const published = captureEvent<{ uploadUrl: string }>(app, 'ReviewPublished');

  try {
    const response = await publish(app, cookie, requestId, {
      rejectDocuments: rejected.map((row, index) => ({
        documentId: row.documentId,
        rejectionReason: `Motivo número ${index + 1}`,
      })),
    }).expect(201);

    expect(response.body.data).toMatchObject({
      rejectedDocuments: 3,
      linkRotated: true,
      emailSent: true,
    });

    await waitForMessages(requestId, 'rejection');
    const emails = await messagesOf(requestId, 'rejection');

    expect(emails).toHaveLength(1);

    const email = provider.lastTo(emails[0].recipient)!;
    expect(email.subject).toContain('3 documentos precisam ser reenviados');
    for (const index of [1, 2, 3]) {
      expect(email.body).toContain(`Motivo número ${index}`);
    }

    // um token novo para as três rejeições, não três rotações
    expect(published.seen).toHaveLength(1);
    expect(await hashOf(requestId)).not.toBe(hashBefore);
    expect(published.seen[0].uploadUrl).toContain('/envio/');
  } finally {
    published.stop();
  }
});

test('os três Itens rejeitados voltam para pending e os aceitos no mesmo lote ficam aceitos', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const documents = await fillEveryItem(app, cookie, requestId, token);
  const [refused, ...accepted] = documents;

  await publish(app, cookie, requestId, {
    acceptItemIds: accepted.map((row) => row.itemId),
    rejectDocuments: [{ documentId: refused.documentId, rejectionReason: 'Página faltando' }],
  }).expect(201);

  await waitForMessages(requestId, 'rejection');
  const panel = await requestPanel(app, cookie, requestId);
  const byId = new Map(panel.items.map((item) => [item.id, item]));

  expect(byId.get(refused.itemId)!.status).toBe('pending');
  expect(byId.get(refused.itemId)!.documents[0].rejectionReason).toBe('Página faltando');
  for (const item of accepted) {
    expect(byId.get(item.itemId)!.status).toBe('accepted');
    expect(byId.get(item.itemId)!.documents[0].reviewStatus).toBe('accepted');
  }

  expect(panel.status).toBe('open');
  // o email do lote é o de recusa: nada de "recebemos tudo" no mesmo ato
  expect(await messagesOf(requestId, 'completion')).toHaveLength(0);
});

test('lote que aceita todos os Itens completa a Solicitação e manda o email de sucesso que já existe', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const documents = await fillEveryItem(app, cookie, requestId, token);

  const response = await publish(app, cookie, requestId, {
    acceptItemIds: documents.map((row) => row.itemId),
  }).expect(201);

  expect(response.body.data).toMatchObject({ completed: true, requestStatus: 'complete' });

  await waitForMessages(requestId, 'completion');
  const emails = await messagesOf(requestId, 'completion');

  expect(emails).toHaveLength(1);
  expect(provider.lastTo(emails[0].recipient)!.subject).toContain('Documentos recebidos');
  expect(await messagesOf(requestId, 'rejection')).toHaveLength(0);
  // aceitar tudo não invalida o link do Responsável
  expect(response.body.data.linkRotated).toBe(false);
});

test('uma decisão inválida recusa o lote inteiro: nada é gravado e nenhum email sai', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const documents = await fillEveryItem(app, cookie, requestId, token);
  const [first, second] = documents;

  // presign sem PUT: existe linha, não existe arquivo — não é documento para revisar
  const ghost = await presignOnly(app, token, {
    fileName: 'fantasma.pdf',
    requestItemId: second.itemId,
  });

  await publish(app, cookie, requestId, {
    acceptItemIds: [first.itemId],
    rejectDocuments: [{ documentId: ghost, rejectionReason: 'Não abre aqui' }],
  }).expect(409);

  const panel = await requestPanel(app, cookie, requestId);
  const firstItem = panel.items.find((item) => item.id === first.itemId)!;

  expect(firstItem.status).toBe('submitted');
  expect(firstItem.documents[0].reviewStatus).toBe('pending');
  expect(await messagesOf(requestId)).toHaveLength(1); // só o link_delivery do fan-out
});

test('Solicitação de outra Contabilidade responde 404 no lote', async () => {
  const target = await setupReview(app, { firmName: 'Contabilidade A', companyName: 'Empresa A' });
  const intruder = await setupReview(app, {
    firmName: 'Contabilidade B',
    companyName: 'Empresa B',
  });
  const documents = await fillEveryItem(app, target.cookie, target.requestId, target.token);

  await publish(app, intruder.cookie, target.requestId, {
    acceptItemIds: [documents[0].itemId],
  }).expect(404);
});

test('documento de outra Solicitação da mesma Contabilidade responde 404', async () => {
  const first = await setupReview(app, { companyName: 'Padaria Central' });
  const other = first.period.requests.find((row: { id: string }) => row.id !== first.requestId);
  const documents = await fillEveryItem(app, first.cookie, first.requestId, first.token);

  if (!other) return; // a competência abriu com uma Empresa só: nada a cruzar

  await publish(app, first.cookie, other.id, {
    acceptItemIds: [documents[0].itemId],
  }).expect(404);
});

test('lote vazio é recusado: publicar sem decisão nenhuma não é revisão', async () => {
  const { cookie, requestId } = await setupReview(app);

  await publish(app, cookie, requestId, {}).expect(422);
});

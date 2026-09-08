import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, message } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http, resetRateLimit } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  createCompany,
  createContactAccess,
  openPeriod,
  uploadFile,
} from '../../factories.js';

/** Área logada do Responsável: o que falta, o histórico com autoria, envio sem link — e a
 *  barreira que não cai: conteúdo de documento nunca é servido. */

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetRateLimit(app);
});

const setup = async () => {
  const session = await createAccountantSession(app);
  const company = await createCompany(app, session.cookie, {
    name: 'Padaria Central',
    contact: { name: 'Ana', email: 'ana@padaria.com' },
  });
  const other = await createCompany(app, session.cookie, {
    name: 'Consultoria Alfa',
    contact: { name: 'Bruno', email: 'bruno@alfa.com' },
  });
  /* Ordem nova (2026-09-07): o Responsável cria o acesso ANTES — a Competência só é
   * aberta para Empresa com Responsável configurado. */
  const access = await createContactAccess(app, {
    companyId: company.id,
    email: 'ana@padaria.com',
    name: 'Ana',
  });
  await createContactAccess(app, { companyId: other.id, email: 'bruno@alfa.com' });

  const period = await openPeriod(app, session.cookie, {
    referenceMonth: '2026-07',
    dueDate: '2026-08-10',
  });
  const token = period.tokenFor('Padaria Central');
  const cookie = access.cookie;

  const request = period.requests.find((row) => row.companyName === 'Padaria Central')!;

  return { session, company, other, period, token, cookie, request };
};

test('profile diz quem ele é, a Empresa e quem o cobra', async () => {
  const { cookie } = await setup();

  const response = await http(app).get('/my/profile').set('cookie', cookie).expect(200);

  expect(response.body.data).toMatchObject({
    name: 'Ana',
    email: 'ana@padaria.com',
    companyName: 'Padaria Central',
  });
});

test('"o que falta" traz só os itens da Empresa dele, com prazo efetivo', async () => {
  const { cookie } = await setup();

  const response = await http(app).get('/my/pending').set('cookie', cookie).expect(200);
  const rows = response.body.data as { referenceMonth: string; item: { dueDate: string } }[];

  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => row.referenceMonth === '2026-07-01')).toBe(true);
  // item sem prazo próprio herda o da Competência
  expect(rows.every((row) => row.item.dueDate !== null)).toBe(true);
});

test('histórico mostra QUEM enviou e o motivo da rejeição, sem servir o arquivo', async () => {
  const { cookie, session, token, period } = await setup();
  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const item = checklist.body.data.items.find((row: { name: string }) =>
    row.name.includes('Extrato bancário'),
  );

  const sent = await uploadFile(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
    content: '%PDF extrato',
  });
  expect(sent.accepted).toBe(true);
  if (!sent.accepted) return;

  await http(app)
    .post(`/documents/${sent.documentId}/reject`)
    .set('cookie', session.cookie)
    .send({ rejectionReason: 'Extrato incompleto: falta a segunda conta.' })
    .expect(201);

  const detail = await http(app).get(`/my/periods/${period.id}`).set('cookie', cookie).expect(200);

  const withDocs = detail.body.data.items.find(
    (row: { documents: unknown[] }) => row.documents.length > 0,
  );
  expect(withDocs.documents[0]).toMatchObject({
    fileName: 'extrato.pdf',
    reviewStatus: 'rejected',
    rejectionReason: 'Extrato incompleto: falta a segunda conta.',
    uploadedByName: 'Ana',
  });
  expect(withDocs.status).toBe('pending');
  expect(JSON.stringify(detail.body.data)).not.toMatch(/storageKey|storage_key/);
});

test('envio logado dispensa o link e registra a autoria', async () => {
  const { cookie, request, period } = await setup();
  const detail = await http(app).get(`/my/periods/${period.id}`).set('cookie', cookie).expect(200);
  const item = detail.body.data.items.find((row: { name: string }) => row.name === 'Livro caixa');
  const content = '%PDF livro caixa de julho';

  const presign = await http(app)
    .post('/my/documents')
    .set('cookie', cookie)
    .send({
      requestId: request.id,
      requestItemId: item.id,
      files: [
        {
          fileName: 'livro-caixa.pdf',
          contentType: 'application/pdf',
          sizeBytes: Buffer.byteLength(content),
        },
      ],
    })
    .expect(201);

  const file = presign.body.data.files[0];
  const url = new URL(file.uploadUrl);
  await http(app)
    .put(url.pathname + url.search)
    .set('content-type', 'application/pdf')
    .send(Buffer.from(content));

  const confirm = await http(app)
    .post('/my/documents/confirm')
    .set('cookie', cookie)
    .send({ requestId: request.id, documentIds: [file.documentId] })
    .expect(201);

  expect(confirm.body.data.confirmed).toBe(1);

  const [row] = await db.select().from(document).where(eq(document.id, file.documentId));
  expect(row.uploadStatus).toBe('uploaded');
  expect(row.uploadedByContactId).not.toBeNull();
});

test('Solicitação de outra Empresa é inalcançável no envio logado', async () => {
  const { cookie, period } = await setup();
  const other = period.requests.find((row) => row.companyName === 'Consultoria Alfa')!;

  await http(app)
    .post('/my/documents')
    .set('cookie', cookie)
    .send({
      requestId: other.id,
      files: [{ fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 5 }],
    })
    .expect(404);
});

test('Competência de outra Empresa não aparece nem por id', async () => {
  const { cookie, session } = await setup();
  const otherPeriod = await openPeriod(app, session.cookie, { referenceMonth: '2026-08' });

  // a competência existe e tem Solicitação da Empresa dele, então aparece…
  await http(app).get(`/my/periods/${otherPeriod.id}`).set('cookie', cookie).expect(200);

  // …mas uma competência de outra Contabilidade não
  const rival = await createAccountantSession(app, { firmName: 'Rival' });
  await createCompany(app, rival.cookie, { name: 'Empresa do Rival' });
  const ofRival = await openPeriod(app, rival.cookie, { referenceMonth: '2026-09' });

  await http(app).get(`/my/periods/${ofRival.id}`).set('cookie', cookie).expect(404);
});

test('inscrição de push é upsert por endpoint e o push sai no evento de rejeição', async () => {
  const { cookie, session, token } = await setup();
  const endpoint = 'https://exemplo.push/abc';

  await http(app)
    .post('/my/push/subscribe')
    .set('cookie', cookie)
    .send({ endpoint, keys: { p256dh: 'p', auth: 'a' } })
    .expect(201);
  // reinscrever com o mesmo endpoint não duplica
  await http(app)
    .post('/my/push/subscribe')
    .set('cookie', cookie)
    .send({ endpoint, keys: { p256dh: 'p2', auth: 'a2' } })
    .expect(201);

  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const item = checklist.body.data.items.find((row: { name: string }) =>
    row.name.includes('Extrato bancário'),
  );
  const sent = await uploadFile(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
    content: '%PDF extrato',
  });
  if (!sent.accepted) throw new Error('upload de apoio falhou');

  await http(app)
    .post(`/documents/${sent.documentId}/reject`)
    .set('cookie', session.cookie)
    .send({ rejectionReason: 'Documento ilegível.' })
    .expect(201);

  // o listener é assíncrono: espera a linha de push aparecer
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const rows = await db.select().from(message).where(eq(message.channel, 'push'));
    if (rows.length > 0) {
      expect(rows[0].purpose).toBe('rejection');
      expect(rows[0].recipient).toBe(endpoint);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('push não foi registrado em message');
});

/** O Item recusado volta para `pending`: sem as recusas na resposta, o Painel de
 *  Pendências pede reenvio sem dizer o que corrigir. */
test('pendências trazem o motivo da recusa do Item reaberto', async () => {
  const { cookie, session, token } = await setup();
  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const item = checklist.body.data.items.find((row: { name: string }) =>
    row.name.includes('Extrato bancário'),
  );

  const sent = await uploadFile(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
    content: '%PDF extrato',
  });
  if (!sent.accepted) throw new Error('upload recusado no setup');

  await http(app)
    .post(`/documents/${sent.documentId}/reject`)
    .set('cookie', session.cookie)
    .send({ rejectionReason: 'Faltam os últimos 10 dias do mês' })
    .expect(201);

  const response = await http(app).get('/my/pending').set('cookie', cookie).expect(200);
  const rows = response.body.data as {
    item: {
      id: string;
      status: string;
      rejections: { fileName: string; rejectionReason: string }[];
    };
  }[];

  const reaberto = rows.find((row) => row.item.id === item.id)!;

  expect(reaberto.item.status).toBe('pending');
  expect(reaberto.item.rejections).toEqual([
    { fileName: 'extrato.pdf', rejectionReason: 'Faltam os últimos 10 dias do mês' },
  ]);

  // Item que nunca recebeu arquivo não ganha recusa nenhuma
  const nuncaEnviado = rows.find((row) => row.item.id !== item.id)!;
  expect(nuncaEnviado.item.rejections).toEqual([]);
});

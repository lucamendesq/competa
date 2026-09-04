import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';
import { message } from '../../../src/infra/database/schema/index.js';
import { http } from '../../app.js';
import { db } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../../factories.js';

/** Ferramentas da área de revisão/encerramento/prazo/zip. Nada aqui dubla repositório:
 *  são atalhos para montar o mesmo estado que as rotas montariam.
 *
 *  ponytail: se outra área precisar destes helpers, `openZip`, `waitFor` e `captureEvent`
 *  deveriam subir para `test/factories.ts` — hoje só esta área os usa. */

export type ReviewItem = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  acceptedFormats: string[];
  documents: { id: string; fileName: string; reviewStatus: string; rejectionReason: string | null }[];
};

/** Contabilidade + Empresa + Competência aberta, com o token em claro do Link. */
export const setupReview = async (
  app: INestApplication,
  options: {
    firmName?: string;
    companyName?: string;
    referenceMonth?: string;
    dueDate?: string;
  } = {},
) => {
  const companyName = options.companyName ?? 'Padaria Central';
  const session = await createAccountantSession(app, { firmName: options.firmName });
  const company = await createCompany(app, session.cookie, { name: companyName });
  const period = await openPeriod(app, session.cookie, {
    referenceMonth: options.referenceMonth ?? '2026-07',
    ...(options.dueDate === undefined ? {} : { dueDate: options.dueDate }),
  });

  return {
    session,
    cookie: session.cookie,
    firm: session.firm,
    company,
    period,
    requestId: period.requests[0].id,
    token: period.tokenFor(companyName),
  };
};

export const requestPanel = async (app: INestApplication, cookie: string, requestId: string) => {
  const response = await http(app).get(`/requests/${requestId}`).set('cookie', cookie).expect(200);

  return response.body.data as {
    id: string;
    status: string;
    items: ReviewItem[];
    extraDocuments: ReviewItem['documents'];
  };
};

export const itemsOf = async (app: INestApplication, cookie: string, requestId: string) =>
  (await requestPanel(app, cookie, requestId)).items;

export const itemNamed = async (
  app: INestApplication,
  cookie: string,
  requestId: string,
  fragment: string,
) => {
  const items = await itemsOf(app, cookie, requestId);
  const found = items.find((item) => item.name.includes(fragment));
  if (!found) throw new Error(`Item "${fragment}" não está na Solicitação`);

  return found;
};

/** Sobe um arquivo pelo fluxo público real e devolve o id — falha alto se foi recusado. */
export const uploadOk = async (
  app: INestApplication,
  token: string,
  file: { fileName: string; requestItemId?: string | null; content?: string; contentType?: string },
) => {
  const result = await uploadFile(app, token, file);
  if (!result.accepted) throw new Error(`Upload recusado: ${result.reason}`);

  return result.documentId;
};

/** Linha de `document` em `awaiting_upload`: presign SEM confirmação (estado que a rota
 *  cria, mas que nenhuma rota deixa observar como enviado). */
export const presignOnly = async (
  app: INestApplication,
  token: string,
  file: { fileName: string; requestItemId?: string | null; contentType?: string },
) => {
  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      ...(file.requestItemId ? { requestItemId: file.requestItemId } : {}),
      files: [
        {
          fileName: file.fileName,
          contentType: file.contentType ?? 'application/pdf',
          sizeBytes: 10,
        },
      ],
    })
    .expect(201);

  const [entry] = response.body.data.files as { accepted: boolean; documentId?: string }[];
  if (!entry.accepted) throw new Error('Presign recusado');

  return entry.documentId!;
};

/** Sobe TODOS os itens da Solicitação e aceita cada um: o caminho até `complete`. */
export const acceptEveryItem = async (
  app: INestApplication,
  cookie: string,
  requestId: string,
  token: string,
) => {
  const items = await itemsOf(app, cookie, requestId);
  const responses = [];

  for (const item of items) {
    await uploadOk(app, token, { fileName: `${item.name}.pdf`, requestItemId: item.id });
    responses.push(
      await http(app).post(`/request-items/${item.id}/accept`).set('cookie', cookie).expect(201),
    );
  }

  const last = responses.at(-1)!.body.data;
  if (last.completed) await waitForMessages(requestId, 'completion');

  return { items, last };
};

/** O rate limit da rota de presign (20/min por IP) é do produto, não do teste: todos os
 *  testes saem do mesmo 127.0.0.1 e estourariam o balde. Zerar o contador entre testes
 *  mantém cada teste independente sem afrouxar o limite real. */
export const resetRateLimit = (app: INestApplication) => {
  const storage = app.get<{ storage: Map<string, unknown> }>(ThrottlerStorage);
  storage.storage.clear();
};

/** Empresa cujo checklist efetivo está vazio (todo tipo do template removido por
 *  override): a Solicitação nasce sem nenhum Item. */
export const emptyChecklistCompany = async (
  app: INestApplication,
  cookie: string,
  name: string,
) => {
  const company = await createCompany(app, cookie, { name });
  const checklist = await http(app)
    .get(`/companies/${company.id}/checklist`)
    .set('cookie', cookie)
    .expect(200);

  for (const line of checklist.body.data.items as { documentTypeId: string }[]) {
    await http(app)
      .put(`/companies/${company.id}/checklist-overrides`)
      .set('cookie', cookie)
      .send({ documentTypeId: line.documentTypeId, action: 'remove' })
      .expect(200);
  }

  return company;
};

/** Os listeners de email rodam fora da requisição (`emit` não é aguardado): o teste
 *  espera pela linha em `message` em vez de dormir um tempo fixo. */
export const waitFor = async <T>(probe: () => Promise<T>, predicate: (value: T) => boolean) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = await probe();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return probe();
};

export const messagesOf = async (requestId: string, purpose?: string) =>
  db
    .select()
    .from(message)
    .where(
      purpose
        ? and(eq(message.requestId, requestId), eq(message.purpose, purpose))
        : eq(message.requestId, requestId),
    );

/** Espera as entregas esperadas ficarem `sent`/`failed`. Não é conforto: a entrega roda
 *  fora da requisição, e o `truncate` do próximo teste trava com um insert em voo. */
export const waitForMessages = (requestId: string, purpose: string, count = 1) =>
  waitFor(
    () => messagesOf(requestId, purpose),
    (rows) => rows.length >= count && rows.every((row) => row.status !== 'queued'),
  );

/** Nenhuma entrega em voo — chamada antes do reset de cada teste desta área. */
export const drainDeliveries = () =>
  waitFor(
    () => db.select({ status: message.status }).from(message).where(eq(message.status, 'queued')),
    (rows) => rows.length === 0,
  );

/** Falha de canal sem tocar em `modules/messaging`: a linha `failed` entra direto no
 *  banco, que é o que o Painel de Pendências lê. */
export const insertFailedMessage = async (
  requestId: string,
  overrides: Partial<typeof message.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(message)
    .values({
      requestId,
      channel: 'email',
      purpose: 'link_delivery',
      recipient: 'responsavel@teste.com',
      status: 'failed',
      error: 'mailbox unavailable',
      ...overrides,
    })
    .returning();

  return row;
};

/** Rejeitar rotaciona o token: o token novo só existe no evento `ItemReopened` (o banco
 *  guarda hash). O teste escuta o evento porque é o único caminho — igual ao email. */
export const rejectDocument = async (
  app: INestApplication,
  cookie: string,
  documentId: string,
  rejectionReason: string,
) => {
  const reopened = captureEvent<{ uploadUrl: string; requestItemId: string }>(app, 'ItemReopened');

  try {
    const response = await http(app)
      .post(`/documents/${documentId}/reject`)
      .set('cookie', cookie)
      .send({ rejectionReason });

    const event = reopened.seen.at(-1);
    if (event) await waitForMessages(response.body.data.requestId, 'rejection');

    return { response, event, token: event?.uploadUrl.split('/').pop() };
  } finally {
    reopened.stop();
  }
};

/** Escuta o evento real emitido pelo controller/cron — o payload não aparece no HTTP. */
export const captureEvent = <T>(app: INestApplication, event: string) => {
  const emitter = app.get(EventEmitter2);
  const seen: T[] = [];
  const listener = (payload: T) => {
    seen.push(payload);
  };

  emitter.on(event, listener);

  return { seen, stop: () => emitter.off(event, listener) };
};

/** Zip como o navegador recebe: corpo binário, sem o parser JSON do supertest. */
export const downloadZip = (app: INestApplication, cookie: string, path: string) =>
  http(app)
    .get(path)
    .set('cookie', cookie)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });

/** Abre o zip DE VERDADE com o `unzip` do sistema: nome de entrada e conteúdo. */
export const openZip = (buffer: Buffer) => {
  const file = join(mkdtempSync(join(tmpdir(), 'zip-review-')), 'entrega.zip');
  writeFileSync(file, buffer);

  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    names,
    read: (name: string) => execFileSync('unzip', ['-p', file, name], { encoding: 'utf8' }),
  };
};

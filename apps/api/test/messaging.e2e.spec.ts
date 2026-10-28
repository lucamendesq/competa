import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import {
  accountingFirm,
  message,
  period,
  requestItem,
  subscription,
  uploadLink,
} from '../src/infra/database/schema/index.js';
import {
  apiClient,
  contactBody,
  createCompany,
  createTemplate,
  documentTypeIds,
  registerFirm,
  uniqueIp,
} from './support/fixtures.js';

const REFERENCE_MONTH = '2026-09';
const GHOST_ID = '018f0000-0000-7000-8000-00000000dead';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

/* As regras de lembrete contam dias-calendário do Brasil, não do relógio UTC do runner. */
const brazilToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const brazilDayPlus = (days: number) => {
  const noon = new Date(`${brazilToday()}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let pushSeq = 0;
const pushBody = () => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/inscricao-msg-${++pushSeq}`,
  keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
});

type CompanyBox = {
  companyId: string;
  contactName: string;
  contactEmail: string;
  requestId: string;
  uploadToken: string;
};

/** Fan-out da competência: a porta de entrada que devolve o token do Link em claro. */
async function openFirmWithCompanies(
  names: string[],
  opts: { dueDay?: number; itemsPerCompany?: number } = {},
) {
  const firm = await registerFirm(app.url);
  const itemsPerCompany = opts.itemsPerCompany ?? 1;
  const dtIds = await documentTypeIds(firm.api, itemsPerCompany);
  const templateId = await createTemplate(
    firm.api,
    dtIds.map((documentTypeId) => ({
      documentTypeId,
      ...(opts.dueDay === undefined ? {} : { dueDay: opts.dueDay }),
    })),
  );

  const boxes: Record<string, CompanyBox> = {};
  for (const name of names) {
    const seed = contactBody();
    const created = await createCompany(firm.api, {
      name,
      checklistTemplateId: templateId,
      contact: seed,
    });
    boxes[name] = {
      companyId: created.id as string,
      contactName: seed.name,
      contactEmail: seed.email,
      requestId: '',
      uploadToken: '',
    };
  }

  const opened = await firm.api.post('/periods', { referenceMonth: REFERENCE_MONTH });
  expect(opened.status, JSON.stringify(opened.body)).toBe(201);
  for (const row of opened.body.data.requests) {
    boxes[row.companyName].requestId = row.id;
    boxes[row.companyName].uploadToken = row.uploadUrl.split('/envio/')[1];
  }

  return { firm, periodId: opened.body.data.id as string, boxes };
}

const messageRowsOf = (requestId: string, purpose?: string) =>
  db
    .select({
      id: message.id,
      channel: message.channel,
      purpose: message.purpose,
      recipient: message.recipient,
      status: message.status,
      sentAt: message.sentAt,
      error: message.error,
    })
    .from(message)
    .where(
      purpose
        ? and(eq(message.requestId, requestId), eq(message.purpose, purpose))
        : eq(message.requestId, requestId),
    )
    .orderBy(message.createdAt, message.id);

/* Listeners de evento são fire-and-forget: a resposta HTTP volta antes do insert — e o
 * insert nasce `queued` antes do update para `sent`/`failed`, então esperar só a contagem
 * perde essa segunda corrida. */
async function waitForMessageRows(requestId: string, count: number, purpose?: string) {
  let rows: Awaited<ReturnType<typeof messageRowsOf>> = [];
  const settled = () => rows.length >= count && rows.every((row) => row.status !== 'queued');
  for (let attempt = 0; attempt < 30 && !settled(); attempt++) {
    rows = await messageRowsOf(requestId, purpose);
    if (!settled()) await sleep(100);
  }
  expect(rows.length, `esperava ${count} message(s) ${purpose ?? ''}`).toBe(count);
  expect(
    rows.every((row) => row.status !== 'queued'),
    'nenhuma message deveria seguir queued',
  ).toBe(true);

  return rows;
}

async function seedMessage(values: {
  requestId: string;
  channel: string;
  purpose: string;
  recipient: string;
  status?: string;
  error?: string;
  sentAt?: Date;
  createdAt?: Date;
}) {
  const [row] = await db
    .insert(message)
    .values({ status: 'sent', ...values })
    .returning({ id: message.id });

  return row.id;
}

const tokenHashOf = async (requestId: string) => {
  const [row] = await db
    .select({ tokenHash: uploadLink.tokenHash })
    .from(uploadLink)
    .where(eq(uploadLink.requestId, requestId));

  return row.tokenHash;
};

const itemIdsOf = async (requestId: string) => {
  const rows = await db
    .select({ id: requestItem.id })
    .from(requestItem)
    .where(eq(requestItem.requestId, requestId));

  return rows.map((row) => row.id);
};

const firmIdOf = async (periodId: string) => {
  const [row] = await db
    .select({ accountingFirmId: period.accountingFirmId })
    .from(period)
    .where(eq(period.id, periodId));

  return row.accountingFirmId;
};

/** O LocalStorage assina a URL com env.PORT (3000); em teste o app sobe em porta efêmera —
 *  trocar só a origem preserva a assinatura, que cobre caminho e query. */
async function putFile(presignUrl: string, content: Buffer) {
  const signed = new URL(presignUrl);
  const origin = new URL(app.url);
  signed.protocol = origin.protocol;
  signed.host = origin.host;

  const res = await fetch(signed, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'x-forwarded-for': uniqueIp() },
    body: new Uint8Array(content),
  });
  expect(res.status, await res.clone().text()).toBe(200);
}

async function uploadViaToken(uploadToken: string, requestItemId?: string) {
  const anon = apiClient(app.url);
  const presigned = await anon.post(`/upload/${uploadToken}/documents`, {
    ...(requestItemId ? { requestItemId } : {}),
    files: [{ fileName: 'comprovante.png', contentType: 'image/png', sizeBytes: PNG_1X1.length }],
  });
  expect(presigned.status, JSON.stringify(presigned.body)).toBe(201);
  const [slot] = presigned.body.data.files;
  expect(slot.accepted, slot.reason).toBe(true);

  await putFile(slot.uploadUrl, PNG_1X1);

  const confirmed = await anon.post(`/upload/${uploadToken}/documents/confirm`, {
    documentIds: [slot.documentId],
  });
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);

  return slot.documentId as string;
}

describe('autorização e chave VAPID', () => {
  it('rotas de mensagens exigem sessão (401 UNAUTHENTICATED)', async () => {
    const anon = apiClient(app.url);

    for (const res of await Promise.all([
      anon.get('/messages'),
      anon.get(`/messages/failures?periodId=${GHOST_ID}`),
      anon.post(`/messages/${GHOST_ID}/resend`),
      anon.post('/messages/reminders/run'),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('GET /push/vapid-key é anônima e devolve a chave do ambiente (vazia = push desligado)', async () => {
    const res = await apiClient(app.url).get('/push/vapid-key');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ key: process.env.VAPID_PUBLIC_KEY ?? '' });
  });
});

describe('GET /messages — listagem, filtros e isolamento', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let aurora: CompanyBox;
  let boreal: CompanyBox;
  let failedEmailId: string;
  let sentPushId: string;
  let failedWhatsappId: string;

  beforeAll(async () => {
    fixture = await openFirmWithCompanies(['Aurora', 'Boreal'], { dueDay: 5 });
    aurora = fixture.boxes.Aurora;
    boreal = fixture.boxes.Boreal;
    await waitForMessageRows(aurora.requestId, 1, 'link_delivery');
    await waitForMessageRows(boreal.requestId, 1, 'link_delivery');

    /* Em teste os provedores (LogEmail/ConsolePush) nunca falham: linha `failed` só nasce
     * semeada. createdAt explícito e espaçado deixa a ordenação determinística. */
    failedEmailId = await seedMessage({
      requestId: aurora.requestId,
      channel: 'email',
      purpose: 'reminder',
      recipient: aurora.contactEmail,
      status: 'failed',
      error: 'SMTP timeout',
      createdAt: hoursAgo(3),
    });
    sentPushId = await seedMessage({
      requestId: aurora.requestId,
      channel: 'push',
      purpose: 'link_delivery',
      recipient: 'https://fcm.googleapis.com/fcm/send/antiga',
      sentAt: hoursAgo(2),
      createdAt: hoursAgo(2),
    });
    failedWhatsappId = await seedMessage({
      requestId: boreal.requestId,
      channel: 'whatsapp',
      purpose: 'reminder',
      recipient: '+5511999990000',
      status: 'failed',
      error: 'Meta error 131026',
      createdAt: hoursAgo(1),
    });
  });

  it('lista com meta de paginação e ordena do mais novo para o mais velho', async () => {
    const res = await fixture.firm.api.get('/messages');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, perPage: 20, total: 5 });
    expect(res.body.data).toHaveLength(5);

    const [first, second, ...seeded] = res.body.data;
    for (const row of [first, second]) {
      expect(row).toMatchObject({
        periodId: fixture.periodId,
        channel: 'email',
        purpose: 'link_delivery',
        status: 'sent',
      });
      expect(row.sentAt).not.toBeNull();
    }
    expect([first.companyName, second.companyName].sort()).toEqual(['Aurora', 'Boreal']);

    expect(seeded.map((row: any) => row.id)).toEqual([failedWhatsappId, sentPushId, failedEmailId]);
    expect(seeded[2]).toMatchObject({
      id: failedEmailId,
      requestId: aurora.requestId,
      periodId: fixture.periodId,
      companyName: 'Aurora',
      channel: 'email',
      purpose: 'reminder',
      recipient: aurora.contactEmail,
      status: 'failed',
      sentAt: null,
      error: 'SMTP timeout',
    });
    expect(typeof seeded[2].createdAt).toBe('string');
  });

  it('filtra por channel, purpose, status, companyId, requestId e periodId', async () => {
    const countOf = async (query: string) => {
      const res = await fixture.firm.api.get(`/messages?${query}`);
      expect(res.status, query).toBe(200);

      return res.body.meta.total as number;
    };

    expect(await countOf('channel=email')).toBe(3);
    expect(await countOf('channel=push')).toBe(1);
    expect(await countOf('channel=whatsapp')).toBe(1);
    expect(await countOf('purpose=reminder')).toBe(2);
    expect(await countOf('status=failed')).toBe(2);
    expect(await countOf('status=sent')).toBe(3);
    expect(await countOf(`companyId=${aurora.companyId}`)).toBe(3);
    expect(await countOf(`requestId=${boreal.requestId}`)).toBe(2);
    expect(await countOf(`periodId=${fixture.periodId}`)).toBe(5);
    expect(await countOf('channel=email&status=failed')).toBe(1);
  });

  it('pagina com perPage e mantém o total', async () => {
    const page1 = await fixture.firm.api.get('/messages?page=1&perPage=2');
    expect(page1.body.meta).toEqual({ page: 1, perPage: 2, total: 5 });
    expect(page1.body.data).toHaveLength(2);

    const page3 = await fixture.firm.api.get('/messages?page=3&perPage=2');
    expect(page3.body.meta).toEqual({ page: 3, perPage: 2, total: 5 });
    expect(page3.body.data).toHaveLength(1);
  });

  it('query inválida → 422 VALIDATION_ERROR', async () => {
    for (const query of ['page=abc', 'perPage=101', 'channel=sms', 'requestId=nao-e-uuid']) {
      const res = await fixture.firm.api.get(`/messages?${query}`);
      expect(res.status, query).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('mensagens de uma firma são invisíveis para outra, mesmo apontando os ids', async () => {
    const stranger = await registerFirm(app.url);

    const everything = await stranger.api.get('/messages');
    expect(everything.body.meta.total).toBe(0);
    expect(everything.body.data).toEqual([]);

    const pointed = await stranger.api.get(`/messages?companyId=${aurora.companyId}`);
    expect(pointed.body.meta.total).toBe(0);

    const resend = await stranger.api.post(`/messages/${failedEmailId}/resend`);
    expect(resend.status).toBe(404);
    expect(resend.body.error.code).toBe('NOT_FOUND');
  });

  describe('GET /messages/failures', () => {
    it('exige periodId válido: ausente ou não-uuid → 422', async () => {
      const missing = await fixture.firm.api.get('/messages/failures');
      expect(missing.status).toBe(422);
      expect(missing.body.error.code).toBe('VALIDATION_ERROR');

      const malformed = await fixture.firm.api.get('/messages/failures?periodId=abc');
      expect(malformed.status).toBe(422);
    });

    it('devolve só as falhas do período, com o texto do erro, sem meta', async () => {
      const res = await fixture.firm.api.get(`/messages/failures?periodId=${fixture.periodId}`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toBeUndefined();
      expect(res.body.data).toEqual([
        {
          requestId: boreal.requestId,
          channel: 'whatsapp',
          purpose: 'reminder',
          recipient: '+5511999990000',
          error: 'Meta error 131026',
          createdAt: expect.any(String),
        },
        {
          requestId: aurora.requestId,
          channel: 'email',
          purpose: 'reminder',
          recipient: aurora.contactEmail,
          error: 'SMTP timeout',
          createdAt: expect.any(String),
        },
      ]);
    });

    it('período desconhecido ou de outra firma → lista vazia, nunca 404', async () => {
      const ghost = await fixture.firm.api.get(`/messages/failures?periodId=${GHOST_ID}`);
      expect(ghost.status).toBe(200);
      expect(ghost.body.data).toEqual([]);

      const stranger = await registerFirm(app.url);
      const foreign = await stranger.api.get(`/messages/failures?periodId=${fixture.periodId}`);
      expect(foreign.status).toBe(200);
      expect(foreign.body.data).toEqual([]);
    });
  });
});

describe('POST /messages/:id/resend', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let openBox: CompanyBox;
  let closedBox: CompanyBox;
  let openLinkMessageId: string;
  let closedLinkMessageId: string;

  beforeAll(async () => {
    fixture = await openFirmWithCompanies(['Aberta', 'Fechada'], { dueDay: 5 });
    openBox = fixture.boxes.Aberta;
    closedBox = fixture.boxes.Fechada;
    [{ id: openLinkMessageId }] = await waitForMessageRows(openBox.requestId, 1, 'link_delivery');
    [{ id: closedLinkMessageId }] = await waitForMessageRows(
      closedBox.requestId,
      1,
      'link_delivery',
    );
  });

  it('id desconhecido → 404; id mal formado → 422', async () => {
    const ghost = await fixture.firm.api.post(`/messages/${GHOST_ID}/resend`);
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe('NOT_FOUND');
    expect(ghost.body.error.message).toBe('Mensagem não encontrada.');

    const malformed = await fixture.firm.api.post('/messages/nao-e-uuid/resend');
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reenvia por email uma mensagem já enviada (status não é checado) sem rotacionar o link', async () => {
    const hashBefore = await tokenHashOf(openBox.requestId);
    const res = await fixture.firm.api.post(`/messages/${openLinkMessageId}/resend`);

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ sent: true });

    const rows = await messageRowsOf(openBox.requestId, 'link_delivery');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      channel: 'email',
      recipient: openBox.contactEmail,
      status: 'sent',
    });
    expect(rows[1].sentAt).not.toBeNull();

    expect(await tokenHashOf(openBox.requestId), 'reenvio de mensagem não rotaciona o link').toBe(
      hashBefore,
    );
  });

  it('mensagem purpose=resend não tem branch de reenvio: { sent: false } sem linha nova', async () => {
    const seededId = await seedMessage({
      requestId: openBox.requestId,
      channel: 'email',
      purpose: 'resend',
      recipient: openBox.contactEmail,
    });

    const res = await fixture.firm.api.post(`/messages/${seededId}/resend`);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ sent: false });
    expect(await messageRowsOf(openBox.requestId, 'resend')).toHaveLength(1);
  });

  it('bug congelado: reenvio de mensagem whatsapp sai por EMAIL (deliver sem channel)', async () => {
    const seededId = await seedMessage({
      requestId: openBox.requestId,
      channel: 'whatsapp',
      purpose: 'reminder',
      recipient: '+5511988887777',
      status: 'failed',
      error: 'Meta error 131026',
    });

    const res = await fixture.firm.api.post(`/messages/${seededId}/resend`);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ sent: true });

    const reminders = await messageRowsOf(openBox.requestId, 'reminder');
    expect(reminders).toHaveLength(2);
    expect(reminders[1]).toMatchObject({
      channel: 'email',
      recipient: '+5511988887777',
      status: 'sent',
    });
  });

  it('push sem inscrição ativa → { sent: false } sem linha nova', async () => {
    const seededId = await seedMessage({
      requestId: openBox.requestId,
      channel: 'push',
      purpose: 'link_delivery',
      recipient: 'https://fcm.googleapis.com/fcm/send/sumida',
    });

    const res = await fixture.firm.api.post(`/messages/${seededId}/resend`);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ sent: false });

    const pushRows = (await messageRowsOf(openBox.requestId)).filter(
      (row) => row.channel === 'push',
    );
    expect(pushRows).toHaveLength(1);
  });

  it('push com inscrição → { sent: true } e linha nova mirando o endpoint', async () => {
    const body = pushBody();
    const subscribed = await apiClient(app.url).post(`/upload/${openBox.uploadToken}/push`, body);
    expect(subscribed.status, JSON.stringify(subscribed.body)).toBe(201);

    const pushRowsBefore = (await messageRowsOf(openBox.requestId)).filter(
      (row) => row.channel === 'push',
    );
    const res = await fixture.firm.api.post(`/messages/${pushRowsBefore[0].id}/resend`);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ sent: true });

    const pushRows = (await messageRowsOf(openBox.requestId)).filter(
      (row) => row.channel === 'push',
    );
    expect(pushRows).toHaveLength(2);
    expect(pushRows[1]).toMatchObject({
      purpose: 'link_delivery',
      recipient: body.endpoint,
      status: 'sent',
    });
  });

  it('solicitação encerrada: 409 para link/push, mas completion reenvia', async () => {
    const completionId = await seedMessage({
      requestId: closedBox.requestId,
      channel: 'email',
      purpose: 'completion',
      recipient: closedBox.contactEmail,
    });
    const pushId = await seedMessage({
      requestId: closedBox.requestId,
      channel: 'push',
      purpose: 'link_delivery',
      recipient: 'https://fcm.googleapis.com/fcm/send/pre-encerramento',
    });
    const subscribed = await apiClient(app.url).post(
      `/upload/${closedBox.uploadToken}/push`,
      pushBody(),
    );
    expect(subscribed.status).toBe(201);

    const closed = await fixture.firm.api.post(`/requests/${closedBox.requestId}/close`);
    expect(closed.status, JSON.stringify(closed.body)).toBe(201);

    const emailResend = await fixture.firm.api.post(`/messages/${closedLinkMessageId}/resend`);
    expect(emailResend.status).toBe(409);
    expect(emailResend.body.error.code).toBe('INVALID_TRANSITION');

    const pushResend = await fixture.firm.api.post(`/messages/${pushId}/resend`);
    expect(pushResend.status).toBe(409);
    expect(pushResend.body.error.code).toBe('INVALID_TRANSITION');

    const completionResend = await fixture.firm.api.post(`/messages/${completionId}/resend`);
    expect(completionResend.status).toBe(201);
    expect(completionResend.body.data).toEqual({ sent: true });
    expect(await messageRowsOf(closedBox.requestId, 'completion')).toHaveLength(2);
  });
});

describe('POST /messages/reminders/run — cadência, teto e knobs', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let dueSoon: CompanyBox;
  let dueFar: CompanyBox;
  let noDueDate: CompanyBox;
  let firmId: string;

  const backdate = (requestId: string) =>
    db
      .update(message)
      .set({ createdAt: daysAgo(4) })
      .where(eq(message.requestId, requestId));

  beforeAll(async () => {
    fixture = await openFirmWithCompanies(['Perto', 'Longe', 'SemPrazo']);
    dueSoon = fixture.boxes.Perto;
    dueFar = fixture.boxes.Longe;
    noDueDate = fixture.boxes.SemPrazo;
    firmId = await firmIdOf(fixture.periodId);

    for (const box of [dueSoon, dueFar, noDueDate]) {
      await waitForMessageRows(box.requestId, 1, 'link_delivery');
    }

    /* Prazos relativos ao HOJE real (a regra usa new Date()): dueSoon = D+2 (dentro do
     * due-soon default 3), dueFar = D+10, sem prazo = null. As entregas do fan-out são
     * apagadas para o gap não bloquear a primeira varredura. */
    await db
      .update(requestItem)
      .set({ dueDate: brazilDayPlus(2) })
      .where(eq(requestItem.requestId, dueSoon.requestId));
    await db
      .update(requestItem)
      .set({ dueDate: brazilDayPlus(10) })
      .where(eq(requestItem.requestId, dueFar.requestId));
    await db
      .delete(message)
      .where(
        inArray(message.requestId, [dueSoon.requestId, dueFar.requestId, noDueDate.requestId]),
      );
  });

  it('varre só quem está perto do prazo (ou sem prazo), envia e rotaciona o link', async () => {
    const hashBefore = await tokenHashOf(dueSoon.requestId);
    const res = await fixture.firm.api.post('/messages/reminders/run');

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ scanned: 3, sent: 2 });

    const [dueSoonReminder] = await waitForMessageRows(dueSoon.requestId, 1, 'reminder');
    expect(dueSoonReminder).toMatchObject({
      channel: 'email',
      recipient: dueSoon.contactEmail,
      status: 'sent',
    });
    await waitForMessageRows(noDueDate.requestId, 1, 'reminder');
    expect(await messageRowsOf(dueFar.requestId, 'reminder')).toHaveLength(0);

    expect(await tokenHashOf(dueSoon.requestId), 'lembrete rotaciona o link').not.toBe(hashBefore);
  });

  it('segunda varredura imediata respeita o gap mínimo', async () => {
    const res = await fixture.firm.api.post('/messages/reminders/run');
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ scanned: 3, sent: 0 });
    expect(await messageRowsOf(dueSoon.requestId, 'reminder')).toHaveLength(1);
  });

  it('gap vencido reenvia; sem prazo o gap é semanal (7 dias)', async () => {
    await backdate(dueSoon.requestId);
    await backdate(noDueDate.requestId);

    const res = await fixture.firm.api.post('/messages/reminders/run');
    expect(res.body.data).toEqual({ scanned: 3, sent: 1 });

    await waitForMessageRows(dueSoon.requestId, 2, 'reminder');
    expect(await messageRowsOf(noDueDate.requestId, 'reminder')).toHaveLength(1);
  });

  it('teto reminderMax (2) bloqueia o terceiro lembrete mesmo com gap vencido', async () => {
    await backdate(dueSoon.requestId);

    const res = await fixture.firm.api.post('/messages/reminders/run');
    expect(res.body.data).toEqual({ scanned: 3, sent: 0 });
    expect(await messageRowsOf(dueSoon.requestId, 'reminder')).toHaveLength(2);
  });

  it('knob reminderDueSoonDays da firma vale no trial (capability reminderTuning)', async () => {
    await db
      .update(accountingFirm)
      .set({ reminderDueSoonDays: 15 })
      .where(eq(accountingFirm.id, firmId));

    const res = await fixture.firm.api.post('/messages/reminders/run');
    expect(res.body.data).toEqual({ scanned: 3, sent: 1 });
    await waitForMessageRows(dueFar.requestId, 1, 'reminder');
  });

  it('sem a capability (plano essencial) os knobs gravados são ignorados: cadência padrão', async () => {
    await db
      .update(subscription)
      .set({ planName: 'essencial' })
      .where(eq(subscription.accountingFirmId, firmId));
    await backdate(dueFar.requestId);

    const res = await fixture.firm.api.post('/messages/reminders/run');
    expect(res.body.data).toEqual({ scanned: 3, sent: 0 });
    expect(await messageRowsOf(dueFar.requestId, 'reminder')).toHaveLength(1);
  });
});

describe('POST /messages/reminders/run — isolamento entre firmas (AUTHZ-2)', () => {
  it('a varredura manual só alcança a Contabilidade do chamador', async () => {
    const firmA = await openFirmWithCompanies(['Minha']);
    const firmB = await openFirmWithCompanies(['Alheia']);

    for (const box of [firmA.boxes.Minha, firmB.boxes.Alheia]) {
      await waitForMessageRows(box.requestId, 1, 'link_delivery');
      await db
        .update(requestItem)
        .set({ dueDate: brazilDayPlus(1) })
        .where(eq(requestItem.requestId, box.requestId));
      await db.delete(message).where(eq(message.requestId, box.requestId));
    }

    const ranByA = await firmA.firm.api.post('/messages/reminders/run');
    expect(ranByA.status).toBe(201);
    expect(ranByA.body.data).toEqual({ scanned: 1, sent: 1 });

    await waitForMessageRows(firmA.boxes.Minha.requestId, 1, 'reminder');
    expect(await messageRowsOf(firmB.boxes.Alheia.requestId, 'reminder')).toHaveLength(0);

    const ranByB = await firmB.firm.api.post('/messages/reminders/run');
    expect(ranByB.body.data).toEqual({ scanned: 1, sent: 1 });
    await waitForMessageRows(firmB.boxes.Alheia.requestId, 1, 'reminder');
  });
});

describe('RequestCreated — entrega do link por email e push adicional (F10-5)', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let firstBox: CompanyBox;

  beforeAll(async () => {
    fixture = await openFirmWithCompanies(['Pioneira'], { dueDay: 5 });
    firstBox = fixture.boxes.Pioneira;
  });

  it('fan-out registra a entrega do link: email ao Responsável, status sent', async () => {
    const [row] = await waitForMessageRows(firstBox.requestId, 1, 'link_delivery');
    expect(row).toMatchObject({
      channel: 'email',
      recipient: firstBox.contactEmail,
      status: 'sent',
    });
    expect(row.sentAt).not.toBeNull();
  });

  it('no mês seguinte, quem tem inscrição de push ganha o aviso ALÉM do email', async () => {
    const body = pushBody();
    const subscribed = await apiClient(app.url).post(`/upload/${firstBox.uploadToken}/push`, body);
    expect(subscribed.status, JSON.stringify(subscribed.body)).toBe(201);

    const opened = await fixture.firm.api.post('/periods', { referenceMonth: '2026-10' });
    expect(opened.status, JSON.stringify(opened.body)).toBe(201);
    const nextRequestId = opened.body.data.requests[0].id as string;

    const rows = await waitForMessageRows(nextRequestId, 2, 'link_delivery');
    const byChannel = Object.fromEntries(rows.map((row) => [row.channel, row]));
    expect(byChannel.email).toMatchObject({ recipient: firstBox.contactEmail, status: 'sent' });
    expect(byChannel.push).toMatchObject({ recipient: body.endpoint, status: 'sent' });
  });

  /* Bug congelado: `onUploadLinkResent` não devolve o boolean da entrega, então o
   * `emitAsync` do controller vê `[undefined]` e responde 503 — mas o deliver JÁ rodou:
   * o email com o link novo sai e fica registrado, e o token nunca é oficializado
   * (`applyUploadToken` não é alcançado). O Responsável recebe um link morto. */
  it('bug congelado: UploadLinkResent pelo Contador → 503, mas o email sai e o link não rotaciona', async () => {
    const hashBefore = await tokenHashOf(firstBox.requestId);
    const res = await fixture.firm.api.post(`/requests/${firstBox.requestId}/upload-link/resend`);

    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');

    /* emitAsync: a entrega é aguardada antes da resposta — sem retry aqui. */
    const rows = await messageRowsOf(firstBox.requestId, 'resend');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: 'email',
      recipient: firstBox.contactEmail,
      status: 'sent',
    });

    expect(await tokenHashOf(firstBox.requestId), 'token do email nunca vira o oficial').toBe(
      hashBefore,
    );
  });
});

describe('revisão: ItemReopened, ReviewPublished e RequestCompleted', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;

  beforeAll(async () => {
    fixture = await openFirmWithCompanies(['Revisada', 'Lote'], { dueDay: 5, itemsPerCompany: 2 });
  });

  it('rejeição unitária entrega a recusa por email E por push para quem tem inscrição', async () => {
    const box = fixture.boxes.Revisada;
    await waitForMessageRows(box.requestId, 1, 'link_delivery');
    const body = pushBody();
    const subscribed = await apiClient(app.url).post(`/upload/${box.uploadToken}/push`, body);
    expect(subscribed.status).toBe(201);

    const [itemId] = await itemIdsOf(box.requestId);
    const documentId = await uploadViaToken(box.uploadToken, itemId);

    const rejected = await fixture.firm.api.post(`/documents/${documentId}/reject`, {
      rejectionReason: 'Arquivo ilegível',
    });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(201);
    expect(rejected.body.data).toMatchObject({ reviewStatus: 'rejected', linkRotated: true });

    const rows = await waitForMessageRows(box.requestId, 2, 'rejection');
    const byChannel = Object.fromEntries(rows.map((row) => [row.channel, row]));
    expect(byChannel.email).toMatchObject({ recipient: box.contactEmail, status: 'sent' });
    expect(byChannel.push).toMatchObject({ recipient: body.endpoint, status: 'sent' });
  });

  it('revisão em lote com N rejeições entrega UMA recusa só', async () => {
    const box = fixture.boxes.Lote;
    await waitForMessageRows(box.requestId, 1, 'link_delivery');
    const [itemA, itemB] = await itemIdsOf(box.requestId);
    const documentA = await uploadViaToken(box.uploadToken, itemA);
    const documentB = await uploadViaToken(box.uploadToken, itemB);

    const published = await fixture.firm.api.post(`/requests/${box.requestId}/review`, {
      rejectDocuments: [
        { documentId: documentA, rejectionReason: 'Fora do padrão' },
        { documentId: documentB, rejectionReason: 'Competência errada' },
      ],
    });
    expect(published.status, JSON.stringify(published.body)).toBe(201);
    expect(published.body.data).toMatchObject({
      rejectedDocuments: 2,
      emailSent: true,
      linkRotated: true,
      completed: false,
    });

    const rows = await waitForMessageRows(box.requestId, 1, 'rejection');
    await sleep(300);
    expect(
      await messageRowsOf(box.requestId, 'rejection'),
      'um email para o lote inteiro',
    ).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: 'email',
      recipient: box.contactEmail,
      status: 'sent',
    });
  });

  it('aceite que completa a Solicitação entrega o email de conclusão', async () => {
    const completa = await openFirmWithCompanies(['Completa'], { dueDay: 5 });
    const box = completa.boxes.Completa;
    await waitForMessageRows(box.requestId, 1, 'link_delivery');

    const [itemId] = await itemIdsOf(box.requestId);
    await uploadViaToken(box.uploadToken, itemId);

    const accepted = await completa.firm.api.post(`/request-items/${itemId}/accept`);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    expect(accepted.body.data.completed).toBe(true);

    const [row] = await waitForMessageRows(box.requestId, 1, 'completion');
    expect(row).toMatchObject({
      channel: 'email',
      recipient: box.contactEmail,
      status: 'sent',
    });
  });
});

describe('DeadlineMissed via POST /deadlines/scan e ContactInvited sem registro', () => {
  let fixture: Awaited<ReturnType<typeof openFirmWithCompanies>>;
  let overdueBox: CompanyBox;

  beforeAll(async () => {
    fixture = await openFirmWithCompanies(['Atrasada'], { dueDay: 5 });
    overdueBox = fixture.boxes.Atrasada;
    await waitForMessageRows(overdueBox.requestId, 1, 'link_delivery');
    await db
      .update(requestItem)
      .set({ dueDate: brazilDayPlus(-1) })
      .where(eq(requestItem.requestId, overdueBox.requestId));
  });

  it('varredura avisa Responsável e Contador, rotaciona o link e marca o item', async () => {
    const hashBefore = await tokenHashOf(overdueBox.requestId);
    const res = await fixture.firm.api.post('/deadlines/scan');

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ overdue: 1, alreadyNotified: 0 });
    expect(res.body.data.notified).toHaveLength(1);
    expect(res.body.data.notified[0]).toMatchObject({ companyName: 'Atrasada' });

    /* emitAsync: as entregas saem antes da resposta do scan. */
    const rows = await messageRowsOf(overdueBox.requestId, 'deadline_missed');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.recipient).sort()).toEqual(
      [overdueBox.contactEmail, fixture.firm.email].sort(),
    );
    expect(rows.every((row) => row.channel === 'email' && row.status === 'sent')).toBe(true);

    expect(await tokenHashOf(overdueBox.requestId)).not.toBe(hashBefore);
  });

  it('segunda varredura não reavisa o mesmo item', async () => {
    const res = await fixture.firm.api.post('/deadlines/scan');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ overdue: 1, alreadyNotified: 1, notified: [] });
    expect(await messageRowsOf(overdueBox.requestId, 'deadline_missed')).toHaveLength(2);
  });

  it('convite de acesso (ContactInvited) sai por sendWithoutLog: nenhuma linha em message', async () => {
    const rowsBefore = await messageRowsOf(overdueBox.requestId);

    const res = await fixture.firm.api.post('/companies/access-invites', {
      companyIds: [overdueBox.companyId],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ invited: 1, skipped: 0 });

    await sleep(400);
    expect(await messageRowsOf(overdueBox.requestId)).toHaveLength(rowsBefore.length);
  });
});

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import {
  document,
  message,
  requestItem,
  subscription,
  uploadLink,
} from '../src/infra/database/schema/index.js';
import {
  apiClient,
  contactBody,
  createCompany,
  createTemplate,
  contactSessionByMagicLink,
  registerFirm,
  uniqueIp,
  type Api,
} from './support/fixtures.js';

/* Competência fixa: 2026-09, offset default 1 → vencimento 2026-10-05 (seg). */
const REFERENCE_MONTH = '2026-09';
const GHOST_ID = '018f0000-0000-7000-8000-00000000dead';
const REASON = 'Documento ilegível';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const CSV_CONTENT = 'data;valor\n2026-09-01;100,00\n';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

const rawRequest = (method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) =>
  fetch(`${app.url}${path}`, {
    method,
    headers: {
      'x-forwarded-for': uniqueIp(),
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

/** Sessão da firma num balde de throttle novo — describes longos estouram o short (30/10s)
 *  se tudo sair do mesmo IP do registerFirm. */
const sessionClient = (cookie: string) => apiClient(app.url, { cookie });

/** Rejeitar rotaciona o Link e MATA o anterior na hora (é o que `linkRotated: true` promete).
 *  Quem for enviar depois de uma rejeição precisa do token novo. */
async function freshUploadToken(api: Api, requestId: string) {
  const res = await api.post(`/requests/${requestId}/upload-link`);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.uploadUrl.split('/envio/')[1] as string;
}

/** O LocalStorage assina a URL com env.PORT (3000); em teste o app sobe em porta efêmera —
 *  trocar só a origem preserva a assinatura, que cobre caminho e query. */
async function putFile(presignUrl: string, content: Buffer | string) {
  const signed = new URL(presignUrl);
  const origin = new URL(app.url);
  signed.protocol = origin.protocol;
  signed.host = origin.host;

  const res = await fetch(signed, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'x-forwarded-for': uniqueIp() },
    body: typeof content === 'string' ? content : new Uint8Array(content),
  });
  expect(res.status, await res.clone().text()).toBe(200);
}

/** Catálogo global (seed): carregado uma vez para escolher tipos com formatos conhecidos. */
let docTypesByName: Map<string, string> | undefined;

const docTypeId = (name: string) => {
  const found = docTypesByName?.get(name);
  expect(found, `tipo de documento "${name}" no catálogo`).toBeDefined();
  return found!;
};

type Box = {
  companyId: string;
  requestId: string;
  uploadToken: string;
  contactName: string;
  contactEmail: string;
};

async function openFirm(
  names: string[],
  itemsFactory?: () => Array<{ documentTypeId: string } & Record<string, unknown>>,
) {
  const firm = await registerFirm(app.url);

  if (!docTypesByName) {
    docTypesByName = new Map();
    for (let page = 1; page <= 5; page++) {
      const catalog = await firm.api.get(`/document-types?page=${page}&perPage=100`);
      expect(catalog.status).toBe(200);
      for (const row of catalog.body.data as Array<{ id: string; name: string }>) {
        docTypesByName.set(row.name, row.id);
      }
      if (page * 100 >= catalog.body.meta.total) break;
    }
  }

  const templateId = await createTemplate(
    firm.api,
    itemsFactory?.() ?? [{ documentTypeId: docTypeId('Notas fiscais emitidas'), dueDay: 5 }],
  );

  const boxes: Record<string, Box> = {};
  for (const name of names) {
    const seed = contactBody();
    const created = await createCompany(firm.api, {
      name,
      checklistTemplateId: templateId,
      contact: seed,
    });
    boxes[name] = {
      companyId: created.id as string,
      requestId: '',
      uploadToken: '',
      contactName: seed.name,
      contactEmail: seed.email,
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

async function uploadVia(
  uploadToken: string,
  file: { fileName: string; content: Buffer | string; contentType: string },
  requestItemId?: string,
) {
  const anon = apiClient(app.url);
  const sizeBytes = Buffer.byteLength(file.content);
  const presigned = await anon.post(`/upload/${uploadToken}/documents`, {
    ...(requestItemId ? { requestItemId } : {}),
    files: [{ fileName: file.fileName, contentType: file.contentType, sizeBytes }],
  });
  expect(presigned.status, JSON.stringify(presigned.body)).toBe(201);
  const [slot] = presigned.body.data.files;
  expect(slot.accepted, slot.reason).toBe(true);

  await putFile(slot.uploadUrl, file.content);

  const confirmed = await anon.post(`/upload/${uploadToken}/documents/confirm`, {
    documentIds: [slot.documentId],
  });
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);

  return { documentId: slot.documentId as string, confirmed: confirmed.body.data };
}

async function requestDetail(api: Api, requestId: string) {
  const res = await api.get(`/requests/${requestId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

const itemOf = (detail: any, name: string) => {
  const found = detail.items.find((row: any) => row.name === name);
  expect(found, `item "${name}" na solicitação`).toBeDefined();
  return found;
};

/* Listeners de evento são fire-and-forget: a resposta volta antes do insert em `message`,
 * e a linha nasce `queued` antes do update para sent/failed — espera assentar. */
async function messagesFor(requestId: string, purpose: string, minimum = 1) {
  let rows: Array<{ purpose: string; recipient: string; status: string }> = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    rows = await db
      .select({ purpose: message.purpose, recipient: message.recipient, status: message.status })
      .from(message)
      .where(and(eq(message.requestId, requestId), eq(message.purpose, purpose)));
    if (rows.length >= minimum && rows.every((row) => row.status !== 'queued')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return rows;
}

const linkHashOf = async (requestId: string) => {
  const [row] = await db
    .select({ tokenHash: uploadLink.tokenHash })
    .from(uploadLink)
    .where(eq(uploadLink.requestId, requestId));
  expect(row).toBeDefined();
  return row.tokenHash;
};

/* PK\x03\x04 = cabecalho local de arquivo: uma ocorrencia por entrada do zip */
const ZIP_ENTRY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const countZipEntries = (buffer: Buffer) => {
  let total = 0;
  let offset = buffer.indexOf(ZIP_ENTRY_SIGNATURE);
  while (offset !== -1) {
    total += 1;
    offset = buffer.indexOf(ZIP_ENTRY_SIGNATURE, offset + 1);
  }
  return total;
};

describe('autorização', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;
  let itemId: string;
  let extraDocumentId: string;

  beforeAll(async () => {
    fixture = await openFirm(['Autoriza']);
    const box = fixture.boxes.Autoriza;
    ({ documentId: extraDocumentId } = await uploadVia(box.uploadToken, {
      fileName: 'extrato.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    }));
    const detail = await requestDetail(fixture.firm.api, box.requestId);
    itemId = detail.items[0].id;
  });

  it('todas as rotas do Contador exigem sessão (401 UNAUTHENTICATED)', async () => {
    const anon = apiClient(app.url);

    for (const res of await Promise.all([
      anon.get(`/requests/${GHOST_ID}`),
      anon.post(`/requests/${GHOST_ID}/upload-link`),
      anon.post(`/requests/${GHOST_ID}/upload-link/resend`),
      anon.post(`/requests/${GHOST_ID}/close`),
      anon.post(`/requests/${GHOST_ID}/review`, { acceptItemIds: [GHOST_ID] }),
      anon.post(`/request-items/${GHOST_ID}/accept`),
      anon.post(`/request-items/${GHOST_ID}/undo-accept`),
      anon.post(`/documents/${GHOST_ID}/reject`, { rejectionReason: REASON }),
      anon.post(`/documents/${GHOST_ID}/review-extra`, { decision: 'accepted' }),
      anon.post('/deadlines/scan'),
      anon.get(`/requests/${GHOST_ID}/zip`),
      anon.get(`/periods/${GHOST_ID}/zip`),
      anon.get(`/documents/${GHOST_ID}/content`),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('recurso de outra Contabilidade responde 404 em toda rota escopada', async () => {
    const other = await registerFirm(app.url);
    const box = fixture.boxes.Autoriza;

    for (const res of await Promise.all([
      other.api.get(`/requests/${box.requestId}`),
      other.api.post(`/requests/${box.requestId}/upload-link`),
      other.api.post(`/requests/${box.requestId}/upload-link/resend`),
      other.api.post(`/requests/${box.requestId}/close`),
      other.api.post(`/requests/${box.requestId}/review`, { acceptItemIds: [GHOST_ID] }),
      other.api.post(`/request-items/${itemId}/accept`),
      other.api.post(`/request-items/${itemId}/undo-accept`),
      other.api.post(`/documents/${extraDocumentId}/reject`, { rejectionReason: REASON }),
      other.api.post(`/documents/${extraDocumentId}/review-extra`, { decision: 'accepted' }),
      other.api.get(`/requests/${box.requestId}/zip`),
      other.api.get(`/periods/${fixture.periodId}/zip`),
      other.api.get(`/documents/${extraDocumentId}/content`),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('id mal formado → 422 VALIDATION_ERROR', async () => {
    const api = sessionClient(fixture.firm.cookie);

    for (const res of await Promise.all([
      api.get('/requests/nao-e-uuid'),
      api.post('/request-items/nao-e-uuid/accept'),
      api.get('/documents/nao-e-uuid/content'),
    ])) {
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('sessão de Responsável não revisa: 403 FORBIDDEN', async () => {
    const box = fixture.boxes.Autoriza;
    const { api: contactApi } = await contactSessionByMagicLink(
      app.url,
      box.uploadToken,
      box.contactEmail,
    );

    for (const res of await Promise.all([
      contactApi.get(`/requests/${box.requestId}`),
      contactApi.post(`/request-items/${itemId}/accept`),
    ])) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('não pertence a uma Contabilidade');
    }
  });
});

describe('GET /requests/:id — detalhe para revisão', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;

  beforeAll(async () => {
    fixture = await openFirm(['Detalhe']);
    const box = fixture.boxes.Detalhe;
    const detail = await requestDetail(fixture.firm.api, box.requestId);
    await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      detail.items[0].id,
    );
    await uploadVia(box.uploadToken, {
      fileName: 'extrato.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });
    /* presign sem PUT: linha awaiting_upload não pode aparecer na revisão */
    const ghost = await apiClient(app.url).post(`/upload/${box.uploadToken}/documents`, {
      files: [{ fileName: 'fantasma.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    expect(ghost.status).toBe(201);
    expect(ghost.body.data.files[0].accepted).toBe(true);
  });

  it('devolve cabeçalho, itens ordenados e documentos por item + extras', async () => {
    const box = fixture.boxes.Detalhe;
    const detail = await requestDetail(sessionClient(fixture.firm.cookie), box.requestId);

    expect(detail).toMatchObject({
      id: box.requestId,
      status: 'open',
      closedAt: null,
      companyId: box.companyId,
      companyName: 'Detalhe',
      periodId: fixture.periodId,
      referenceMonth: `${REFERENCE_MONTH}-01`,
      periodDueDate: null,
    });

    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]).toMatchObject({
      name: 'Notas fiscais emitidas',
      status: 'submitted',
      dueDate: '2026-10-05',
      acceptedFormats: ['xml', 'pdf', 'zip'],
    });
    expect(detail.items[0].documents).toHaveLength(1);
    expect(detail.items[0].documents[0]).toMatchObject({
      fileName: 'nota.png',
      reviewStatus: 'pending',
      rejectionReason: null,
      sizeBytes: PNG_1X1.length,
    });

    expect(detail.extraDocuments).toHaveLength(1);
    expect(detail.extraDocuments[0]).toMatchObject({
      fileName: 'extrato.csv',
      requestItemId: null,
      reviewStatus: 'pending',
    });
  });

  it('id desconhecido → 404 NOT_FOUND', async () => {
    const res = await fixture.firm.api.get(`/requests/${GHOST_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Solicitação não encontrada.');
  });
});

describe('rotação do Link de Upload (upload-link e resend)', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;
  let originalToken: string;

  beforeAll(async () => {
    fixture = await openFirm(['Rotativa']);
    originalToken = fixture.boxes.Rotativa.uploadToken;
  });

  it('POST :id/upload-link troca o token e mantém o antigo na carência', async () => {
    const box = fixture.boxes.Rotativa;
    const hashBefore = await linkHashOf(box.requestId);

    const res = await fixture.firm.api.post(`/requests/${box.requestId}/upload-link`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.uploadUrl).toMatch(/^http:\/\/localhost:5173\/envio\/.+/);
    expect(res.body.data.contactEmail).toBe(box.contactEmail);

    expect(await linkHashOf(box.requestId)).not.toBe(hashBefore);

    const fresh = res.body.data.uploadUrl.split('/envio/')[1];
    const newToken = await apiClient(app.url).get(`/upload/${fresh}`);
    expect(newToken.status).toBe(200);

    const graced = await apiClient(app.url).get(`/upload/${originalToken}`);
    expect(graced.status, 'token anterior vive na carência de 48h').toBe(200);
  });

  /* O reenvio oficializa o token ANTES de mandar o email, então o link que o Responsável
   * recebe é o que vale. E o listener devolve se entregou, que é o que separa 201 de 503. */
  it('resend: 201, email sai e o link entregue é o que vale', async () => {
    const box = fixture.boxes.Rotativa;
    const hashBefore = await linkHashOf(box.requestId);

    const res = await fixture.firm.api.post(`/requests/${box.requestId}/upload-link/resend`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const deliveries = await messagesFor(box.requestId, 'resend');
    expect(deliveries).toEqual([
      { purpose: 'resend', recipient: box.contactEmail, status: 'sent' },
    ]);

    expect(await linkHashOf(box.requestId), 'o token rotacionou').not.toBe(hashBefore);

    const token = res.body.data.uploadUrl.split('/envio/')[1];
    const opened = await apiClient(app.url).get(`/upload/${token}`);
    expect(opened.status, 'o link entregue abre').toBe(200);
  });

  it('solicitação encerrada não rotaciona nem reenvia → 409 INVALID_TRANSITION', async () => {
    const box = fixture.boxes.Rotativa;
    const closed = await fixture.firm.api.post(`/requests/${box.requestId}/close`);
    expect(closed.status).toBe(201);

    for (const res of await Promise.all([
      fixture.firm.api.post(`/requests/${box.requestId}/upload-link`),
      fixture.firm.api.post(`/requests/${box.requestId}/upload-link/resend`),
    ])) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
      expect(res.body.error.message).toBe('Solicitação encerrada — não há mais link de envio.');
    }
  });
});

describe('POST /requests/:id/close', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;

  beforeAll(async () => {
    fixture = await openFirm(['Encerrada', 'EncerradaLimpa']);
    const box = fixture.boxes.Encerrada;
    await uploadVia(box.uploadToken, {
      fileName: 'extrato.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });
  });

  it('encerra com aviso de itens sem aceite', async () => {
    const box = fixture.boxes.Encerrada;
    const res = await fixture.firm.api.post(`/requests/${box.requestId}/close`);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      id: box.requestId,
      status: 'closed',
      pendingItemCount: 1,
      warning: 'Solicitação encerrada com 1 item(ns) sem aceite.',
    });
    expect(res.body.data.closedAt).not.toBeNull();
  });

  it('encerrar de novo → 409 INVALID_TRANSITION', async () => {
    const res = await fixture.firm.api.post(`/requests/${fixture.boxes.Encerrada.requestId}/close`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Esta solicitação já foi encerrada.');
  });

  it('encerrada bloqueia accept, undo e reject — mas NÃO o review-extra (bug congelado)', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const box = fixture.boxes.Encerrada;
    const detail = await requestDetail(api, box.requestId);
    const itemId = detail.items[0].id;
    const extraId = detail.extraDocuments[0].id;

    const accepted = await api.post(`/request-items/${itemId}/accept`);
    expect(accepted.status).toBe(409);
    expect(accepted.body.error.message).toBe(
      'Esta solicitação foi encerrada: os itens não podem mais ser revisados.',
    );

    const undone = await api.post(`/request-items/${itemId}/undo-accept`);
    expect(undone.status).toBe(409);
    expect(undone.body.error.message).toBe(
      'Esta solicitação foi encerrada: o aceite não pode mais ser desfeito.',
    );

    const rejected = await api.post(`/documents/${extraId}/reject`, { rejectionReason: REASON });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.message).toBe(
      'Esta solicitação foi encerrada: os documentos não podem mais ser revisados.',
    );

    /* Bug congelado: reviewExtraRefusal recebe requestStatus e ignora — Extra continua
     * revisável depois do encerramento, ao contrário de item e documento de item. */
    const extraReviewed = await api.post(`/documents/${extraId}/review-extra`, {
      decision: 'accepted',
    });
    expect(extraReviewed.status).toBe(201);
    expect(extraReviewed.body.data.reviewStatus).toBe('accepted');
  });

  it('sem pendência o aviso é nulo', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const box = fixture.boxes.EncerradaLimpa;
    const detail = await requestDetail(api, box.requestId);
    await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      detail.items[0].id,
    );
    const accepted = await api.post(`/request-items/${detail.items[0].id}/accept`);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);

    const res = await api.post(`/requests/${box.requestId}/close`);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ pendingItemCount: 0, warning: null });
  });
});

describe('revisão unitária — aceite, desfazer e rejeição', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;
  let box: Box;
  let itemId: string;
  let firstDocumentId: string;

  beforeAll(async () => {
    fixture = await openFirm(['Revisada']);
    box = fixture.boxes.Revisada;
    const detail = await requestDetail(fixture.firm.api, box.requestId);
    itemId = detail.items[0].id;
  });

  it('aceitar item sem envio → 409', async () => {
    const res = await fixture.firm.api.post(`/request-items/${itemId}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.message).toBe(
      'Este item ainda não tem documentos enviados para revisar.',
    );
  });

  it('aceitar item submitted completa a solicitação de um item só', async () => {
    const api = sessionClient(fixture.firm.cookie);
    ({ documentId: firstDocumentId } = await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      itemId,
    ));

    const res = await api.post(`/request-items/${itemId}/accept`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      requestId: box.requestId,
      requestItemId: itemId,
      itemName: 'Notas fiscais emitidas',
      acceptedDocuments: 1,
      requestStatus: 'complete',
      completed: true,
      companyName: 'Revisada',
      contactName: box.contactName,
      contactEmail: box.contactEmail,
    });

    const detail = await requestDetail(api, box.requestId);
    expect(detail.status).toBe('complete');
    expect(detail.items[0].status).toBe('accepted');
    expect(detail.items[0].documents[0].reviewStatus).toBe('accepted');

    const completions = await messagesFor(box.requestId, 'completion');
    expect(completions).toEqual([
      { purpose: 'completion', recipient: box.contactEmail, status: 'sent' },
    ]);
  });

  it('aceitar de novo → 409', async () => {
    const res = await fixture.firm.api.post(`/request-items/${itemId}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este item já está aceito.');
  });

  it('undo-accept devolve o item para submitted e reabre a solicitação', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const res = await api.post(`/request-items/${itemId}/undo-accept`);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      requestId: box.requestId,
      requestItemId: itemId,
      itemName: 'Notas fiscais emitidas',
      itemStatus: 'submitted',
      revertedDocuments: 1,
      requestStatus: 'open',
    });

    const detail = await requestDetail(api, box.requestId);
    expect(detail.items[0].documents[0].reviewStatus).toBe('pending');
  });

  it('undo-accept em item não aceito → 409', async () => {
    const res = await fixture.firm.api.post(`/request-items/${itemId}/undo-accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este item não está aceito.');
  });

  it('rejeitar documento reabre o item, limpa a marca do cron e rotaciona o link', async () => {
    const api = sessionClient(fixture.firm.cookie);
    /* marca do cron plantada para provar que a rejeição a limpa (reaviso de prazo) */
    await db
      .update(requestItem)
      .set({ deadlineNotifiedAt: new Date() })
      .where(eq(requestItem.id, itemId));
    const hashBefore = await linkHashOf(box.requestId);

    const res = await api.post(`/documents/${firstDocumentId}/reject`, {
      rejectionReason: REASON,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      documentId: firstDocumentId,
      fileName: 'nota.png',
      reviewStatus: 'rejected',
      requestItemId: itemId,
      itemStatus: 'pending',
      requestStatus: 'open',
      linkRotated: true,
    });

    const [itemRow] = await db
      .select({ status: requestItem.status, deadlineNotifiedAt: requestItem.deadlineNotifiedAt })
      .from(requestItem)
      .where(eq(requestItem.id, itemId));
    expect(itemRow).toEqual({ status: 'pending', deadlineNotifiedAt: null });

    expect(await linkHashOf(box.requestId)).not.toBe(hashBefore);

    const rejections = await messagesFor(box.requestId, 'rejection');
    expect(rejections).toEqual([
      { purpose: 'rejection', recipient: box.contactEmail, status: 'sent' },
    ]);
  });

  it('linkRotated: o token anterior morre na hora', async () => {
    /* A carência de 48h é do lembrete e do reenvio, onde o Responsável pode estar com o link
     * velho aberto. Aqui o Contador acabou de agir SOBRE o link. */
    const res = await apiClient(app.url).get(`/upload/${box.uploadToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UPLOAD_LINK_INVALID');

    box.uploadToken = await freshUploadToken(fixture.firm.api, box.requestId);
    expect((await apiClient(app.url).get(`/upload/${box.uploadToken}`)).status).toBe(200);
  });

  it('rejeitar de novo → 409; motivo curto → 422', async () => {
    const again = await fixture.firm.api.post(`/documents/${firstDocumentId}/reject`, {
      rejectionReason: REASON,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('Este documento já foi rejeitado.');

    const short = await fixture.firm.api.post(`/documents/${GHOST_ID}/reject`, {
      rejectionReason: 'ab',
    });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reenvio após rejeição fecha o ciclo: submitted → accepted → complete', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const { confirmed } = await uploadVia(
      box.uploadToken,
      { fileName: 'nota-corrigida.png', content: PNG_1X1, contentType: 'image/png' },
      itemId,
    );
    expect(confirmed.submittedItemIds).toEqual([itemId]);

    const res = await api.post(`/request-items/${itemId}/accept`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      acceptedDocuments: 1,
      requestStatus: 'complete',
      completed: true,
    });
  });

  it('documento aceito não volta para rejeitado → 409', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const detail = await requestDetail(api, box.requestId);
    const accepted = detail.items[0].documents.find((row: any) => row.reviewStatus === 'accepted');

    const res = await api.post(`/documents/${accepted.id}/reject`, { rejectionReason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este documento já foi aceito e não volta para rejeitado.');
  });
});

describe('documentos extra — POST /documents/:id/review-extra', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;
  let box: Box;

  beforeAll(async () => {
    fixture = await openFirm(['Extras']);
    box = fixture.boxes.Extras;
  });

  it('quirk congelado: aceitar COM motivo grava o motivo mesmo sem rejeição', async () => {
    const { documentId } = await uploadVia(box.uploadToken, {
      fileName: 'extrato.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });

    /* `rejectionReason: decision.rejectionReason ?? null` não é condicionado à decisão —
     * diferente do caminho em lote, que zera o motivo quando o decision é accepted. */
    const res = await fixture.firm.api.post(`/documents/${documentId}/review-extra`, {
      decision: 'accepted',
      rejectionReason: 'Nota sem valor',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      id: documentId,
      fileName: 'extrato.csv',
      reviewStatus: 'accepted',
      rejectionReason: 'Nota sem valor',
    });

    const again = await fixture.firm.api.post(`/documents/${documentId}/review-extra`, {
      decision: 'accepted',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('Este documento já está aceito.');
  });

  it('rejeitar exige motivo; com motivo marca rejected sem reabrir nada', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const { documentId } = await uploadVia(box.uploadToken, {
      fileName: 'balancete.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });
    const hashBefore = await linkHashOf(box.requestId);

    const missing = await api.post(`/documents/${documentId}/review-extra`, {
      decision: 'rejected',
    });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    const res = await api.post(`/documents/${documentId}/review-extra`, {
      decision: 'rejected',
      rejectionReason: REASON,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ reviewStatus: 'rejected', rejectionReason: REASON });

    expect(await linkHashOf(box.requestId), 'rejeitar Extra não rotaciona o link').toBe(hashBefore);
  });

  it('rota de rejeição de item recusa Extra; review-extra recusa documento de item', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const { documentId: extraId } = await uploadVia(box.uploadToken, {
      fileName: 'outro.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });
    const detail = await requestDetail(api, box.requestId);
    const { documentId: itemDocId } = await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      detail.items[0].id,
    );

    const viaReject = await api.post(`/documents/${extraId}/reject`, { rejectionReason: REASON });
    expect(viaReject.status).toBe(409);
    expect(viaReject.body.error.message).toBe(
      'Documento Extra é revisado em /documents/:id/review-extra, não por esta rota.',
    );

    const viaExtra = await api.post(`/documents/${itemDocId}/review-extra`, {
      decision: 'accepted',
    });
    expect(viaExtra.status).toBe(409);
    expect(viaExtra.body.error.message).toBe(
      'Este documento pertence a um item: aceite pelo item (em lote) ou rejeite pelo documento.',
    );
  });

  it('linha de presign sem arquivo no storage não é revisável → 409', async () => {
    const presigned = await apiClient(app.url).post(`/upload/${box.uploadToken}/documents`, {
      files: [{ fileName: 'nunca-subiu.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    expect(presigned.status).toBe(201);
    const ghostId = presigned.body.data.files[0].documentId;

    const res = await fixture.firm.api.post(`/documents/${ghostId}/review-extra`, {
      decision: 'accepted',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este documento ainda não foi enviado ao storage.');
  });
});

describe('revisão em lote — POST /requests/:id/review', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;
  let box: Box;
  let itemAId: string;
  let itemBId: string;
  let itemBDocId: string;
  let extraId: string;

  beforeAll(async () => {
    fixture = await openFirm(['Lote', 'LoteDois'], () => [
      { documentTypeId: docTypeId('Notas fiscais emitidas'), dueDay: 5 },
      { documentTypeId: docTypeId('Extrato bancário') },
    ]);
    box = fixture.boxes.Lote;

    const detail = await requestDetail(fixture.firm.api, box.requestId);
    itemAId = itemOf(detail, 'Notas fiscais emitidas').id;
    itemBId = itemOf(detail, 'Extrato bancário').id;

    await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      itemAId,
    );
    ({ documentId: itemBDocId } = await uploadVia(
      box.uploadToken,
      { fileName: 'extrato.png', content: PNG_1X1, contentType: 'image/png' },
      itemBId,
    ));
    ({ documentId: extraId } = await uploadVia(box.uploadToken, {
      fileName: 'anexo.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    }));
  });

  it('publica aceite + rejeição + extra numa transação com UM email e UMA rotação', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const hashBefore = await linkHashOf(box.requestId);

    const res = await api.post(`/requests/${box.requestId}/review`, {
      acceptItemIds: [itemAId],
      rejectDocuments: [{ documentId: itemBDocId, rejectionReason: REASON }],
      reviewExtras: [{ documentId: extraId, decision: 'accepted' }],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      requestId: box.requestId,
      requestStatus: 'open',
      completed: false,
      acceptedItems: 1,
      rejectedDocuments: 1,
      linkRotated: true,
      emailSent: true,
    });

    expect(await linkHashOf(box.requestId)).not.toBe(hashBefore);

    const detail = await requestDetail(api, box.requestId);
    expect(itemOf(detail, 'Notas fiscais emitidas').status).toBe('accepted');
    expect(itemOf(detail, 'Extrato bancário').status).toBe('pending');
    expect(detail.extraDocuments[0].reviewStatus).toBe('accepted');

    const rejections = await messagesFor(box.requestId, 'rejection');
    expect(rejections, 'um ReviewPublished, não um email por rejeição').toHaveLength(1);
    expect(rejections[0]).toMatchObject({ recipient: box.contactEmail, status: 'sent' });
  });

  it('id de fora da solicitação → 404 sem aplicar nada', async () => {
    const api = sessionClient(fixture.firm.cookie);

    const badItem = await api.post(`/requests/${box.requestId}/review`, {
      acceptItemIds: [GHOST_ID],
    });
    expect(badItem.status).toBe(404);
    expect(badItem.body.error.message).toBe('Item não encontrado nesta solicitação.');

    const badDocument = await api.post(`/requests/${box.requestId}/review`, {
      rejectDocuments: [{ documentId: GHOST_ID, rejectionReason: REASON }],
    });
    expect(badDocument.status).toBe(404);
    expect(badDocument.body.error.message).toBe('Documento não encontrado nesta solicitação.');
  });

  it('decisão inválida recusa o lote inteiro (tudo ou nada)', async () => {
    const api = sessionClient(fixture.firm.cookie);
    // a rejeição do lote anterior rotacionou o Link e matou o token velho
    box.uploadToken = await freshUploadToken(api, box.requestId);
    const { confirmed } = await uploadVia(
      box.uploadToken,
      { fileName: 'extrato-corrigido.png', content: PNG_1X1, contentType: 'image/png' },
      itemBId,
    );
    expect(confirmed.submittedItemIds).toEqual([itemBId]);

    const res = await api.post(`/requests/${box.requestId}/review`, {
      acceptItemIds: [itemAId, itemBId],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este item já está aceito.');

    const detail = await requestDetail(api, box.requestId);
    expect(itemOf(detail, 'Extrato bancário').status, 'lote recusado não aplica o aceite').toBe(
      'submitted',
    );
  });

  it('lote que aceita o último item obrigatório completa a solicitação', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const res = await api.post(`/requests/${box.requestId}/review`, {
      acceptItemIds: [itemBId],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      requestStatus: 'complete',
      completed: true,
      linkRotated: false,
      emailSent: true,
    });

    const completions = await messagesFor(box.requestId, 'completion');
    expect(completions).toHaveLength(1);
  });

  it('lote sem decisão → 422; extra de item no lote → 409 com mensagem própria', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const other = fixture.boxes.LoteDois;

    const empty = await api.post(`/requests/${other.requestId}/review`, {});
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const detail = await requestDetail(api, other.requestId);
    const { documentId } = await uploadVia(
      other.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      itemOf(detail, 'Notas fiscais emitidas').id,
    );

    const res = await api.post(`/requests/${other.requestId}/review`, {
      reviewExtras: [{ documentId, decision: 'accepted' }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este documento pertence a um Item: revise-o pelo Item.');
  });

  it('só aceite que não completa: emailSent false e nenhum email sai', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const other = fixture.boxes.LoteDois;
    const detail = await requestDetail(api, other.requestId);
    const pendingItemId = itemOf(detail, 'Notas fiscais emitidas').id;

    const res = await api.post(`/requests/${other.requestId}/review`, {
      acceptItemIds: [pendingItemId],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      completed: false,
      emailSent: false,
      linkRotated: false,
      requestStatus: 'open',
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await messagesFor(other.requestId, 'rejection', 0)).toHaveLength(0);
    expect(await messagesFor(other.requestId, 'completion', 0)).toHaveLength(0);
  });
});

describe('item opcional não segura o complete', () => {
  it('aceitar só o obrigatório completa; desfazer reabre', async () => {
    const fixture = await openFirm(['Opcional'], () => [
      { documentTypeId: docTypeId('Notas fiscais emitidas'), dueDay: 5 },
      { documentTypeId: docTypeId('Extrato bancário'), required: false },
    ]);
    const box = fixture.boxes.Opcional;
    const api = fixture.firm.api;
    const detail = await requestDetail(api, box.requestId);
    const requiredItemId = itemOf(detail, 'Notas fiscais emitidas').id;

    await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      requiredItemId,
    );
    const accepted = await api.post(`/request-items/${requiredItemId}/accept`);
    expect(accepted.status).toBe(201);
    expect(accepted.body.data).toMatchObject({ requestStatus: 'complete', completed: true });

    const undone = await api.post(`/request-items/${requiredItemId}/undo-accept`);
    expect(undone.body.data.requestStatus).toBe('open');
  });

  it('checklist só de opcionais nunca completa (regra congelada)', async () => {
    const fixture = await openFirm(['SoOpcional'], () => [
      { documentTypeId: docTypeId('Notas fiscais emitidas'), dueDay: 5, required: false },
    ]);
    const box = fixture.boxes.SoOpcional;
    const detail = await requestDetail(fixture.firm.api, box.requestId);

    await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      detail.items[0].id,
    );
    const accepted = await fixture.firm.api.post(`/request-items/${detail.items[0].id}/accept`);
    expect(accepted.status).toBe(201);
    expect(accepted.body.data).toMatchObject({ requestStatus: 'open', completed: false });
  });
});

describe('upload público — GET /upload/:token e invariante só-escrita', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;

  beforeAll(async () => {
    fixture = await openFirm(['Publica', 'Revogada', 'Vencida']);
    const box = fixture.boxes.Publica;
    const detail = await requestDetail(fixture.firm.api, box.requestId);
    await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      detail.items[0].id,
    );
    await uploadVia(box.uploadToken, {
      fileName: 'extrato.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });
  });

  it('checklist expõe status e motivo — nunca nome de arquivo nem storage key', async () => {
    const box = fixture.boxes.Publica;
    const res = await apiClient(app.url).get(`/upload/${box.uploadToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const checklist = res.body.data;
    expect(Object.keys(checklist).sort()).toEqual([
      'accountingFirm',
      'accountingFirmLogoUrl',
      'company',
      'dueDate',
      'extraDocuments',
      'hasAccess',
      'items',
      'referenceMonth',
      'status',
    ]);
    expect(checklist).toMatchObject({
      company: 'Publica',
      accountingFirm: fixture.firm.firmName,
      accountingFirmLogoUrl: null,
      hasAccess: false,
      referenceMonth: `${REFERENCE_MONTH}-01`,
      dueDate: null,
      status: 'open',
    });

    expect(checklist.items).toHaveLength(1);
    expect(Object.keys(checklist.items[0]).sort()).toEqual([
      'acceptedFormats',
      'description',
      'documents',
      'dueDate',
      'id',
      'name',
      'status',
    ]);
    expect(checklist.items[0]).toMatchObject({
      name: 'Notas fiscais emitidas',
      status: 'submitted',
      dueDate: '2026-10-05',
      acceptedFormats: ['xml', 'pdf', 'zip'],
    });
    expect(checklist.items[0].documents).toHaveLength(1);
    expect(Object.keys(checklist.items[0].documents[0]).sort()).toEqual([
      'rejectionReason',
      'requestItemId',
      'reviewStatus',
    ]);
    expect(checklist.extraDocuments).toHaveLength(1);
    expect(Object.keys(checklist.extraDocuments[0]).sort()).toEqual([
      'rejectionReason',
      'requestItemId',
      'reviewStatus',
    ]);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('nota.png');
    expect(serialized).not.toContain('extrato.csv');
    expect(serialized).not.toContain('storage');
  });

  it('token desconhecido → 404 UPLOAD_LINK_INVALID nas três rotas', async () => {
    const anon = apiClient(app.url);

    for (const res of await Promise.all([
      anon.get('/upload/token-que-nao-existe'),
      anon.post('/upload/token-que-nao-existe/documents', {
        files: [{ fileName: 'x.csv', contentType: 'text/csv', sizeBytes: 10 }],
      }),
      anon.post('/upload/token-que-nao-existe/documents/confirm', { documentIds: [GHOST_ID] }),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('UPLOAD_LINK_INVALID');
    }
  });

  it('link revogado e link vencido → mesmo 404 cego', async () => {
    await db
      .update(uploadLink)
      .set({ revoked: true })
      .where(eq(uploadLink.requestId, fixture.boxes.Revogada.requestId));
    const revoked = await apiClient(app.url).get(`/upload/${fixture.boxes.Revogada.uploadToken}`);
    expect(revoked.status).toBe(404);
    expect(revoked.body.error.code).toBe('UPLOAD_LINK_INVALID');

    await db
      .update(uploadLink)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(uploadLink.requestId, fixture.boxes.Vencida.requestId));
    const expired = await apiClient(app.url).post(
      `/upload/${fixture.boxes.Vencida.uploadToken}/documents`,
      { files: [{ fileName: 'x.csv', contentType: 'text/csv', sizeBytes: 10 }] },
    );
    expect(expired.status).toBe(404);
    expect(expired.body.error.code).toBe('UPLOAD_LINK_INVALID');
  });
});

describe('upload público — regras de arquivo no presign e na confirmação', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;
  let box: Box;
  let itemId: string;

  beforeAll(async () => {
    fixture = await openFirm(['Arquivos', 'FechadaUp']);
    box = fixture.boxes.Arquivos;
    const detail = await requestDetail(fixture.firm.api, box.requestId);
    itemId = detail.items[0].id;
  });

  it('cada arquivo recusado volta com o próprio motivo, sem reservar linha', async () => {
    const res = await apiClient(app.url).post(`/upload/${box.uploadToken}/documents`, {
      requestItemId: itemId,
      files: [
        { fileName: 'virus.exe', contentType: 'application/pdf', sizeBytes: 10 },
        { fileName: '', contentType: 'text/csv', sizeBytes: 10 },
        { fileName: 'vazio.csv', contentType: 'text/csv', sizeBytes: 0 },
        { fileName: 'gigante.pdf', contentType: 'application/pdf', sizeBytes: 101 * 1024 * 1024 },
        { fileName: `${'a'.repeat(252)}.pdf`, contentType: 'application/pdf', sizeBytes: 10 },
        { fileName: 'planilha.csv', contentType: 'text/csv', sizeBytes: 10 },
      ],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const reasons = res.body.data.files.map((row: any) => {
      expect(row.accepted).toBe(false);
      expect(row.documentId).toBeUndefined();
      return row.reason;
    });
    expect(reasons).toEqual([
      'Formato .exe não aceito neste item (aceitos: xml, pdf, zip, jpg, jpeg, png).',
      'Nome do arquivo não pode ser vazio.',
      'Arquivo vazio (0 bytes).',
      'Arquivo de 101 MB acima do limite de 100 MB por arquivo.',
      'Nome do arquivo excede o limite de 255 caracteres.',
      'Formato .csv não aceito neste item (aceitos: xml, pdf, zip, jpg, jpeg, png).',
    ]);

    const rows = await db
      .select({ id: document.id })
      .from(document)
      .where(eq(document.requestId, box.requestId));
    expect(rows).toHaveLength(0);
  });

  it('imagem entra em qualquer item, mesmo fora dos formatos do template', async () => {
    const { confirmed } = await uploadVia(
      box.uploadToken,
      { fileName: 'foto-da-nota.png', content: PNG_1X1, contentType: 'image/png' },
      itemId,
    );
    expect(confirmed).toEqual({ confirmed: 1, submittedItemIds: [itemId], refused: [] });
  });

  it('presign sem arquivos → 422; item de outra solicitação → 404', async () => {
    const anon = apiClient(app.url);

    const empty = await anon.post(`/upload/${box.uploadToken}/documents`, { files: [] });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const foreignDetail = await requestDetail(
      sessionClient(fixture.firm.cookie),
      fixture.boxes.FechadaUp.requestId,
    );
    const foreign = await anon.post(`/upload/${box.uploadToken}/documents`, {
      requestItemId: foreignDetail.items[0].id,
      files: [{ fileName: 'nota.png', contentType: 'image/png', sizeBytes: 10 }],
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.message).toBe('Item não encontrado nesta solicitação.');
  });

  it('solicitação encerrada: item recusa envio, Extra continua aceito (congelado)', async () => {
    const other = fixture.boxes.FechadaUp;
    const detail = await requestDetail(sessionClient(fixture.firm.cookie), other.requestId);
    const closed = await fixture.firm.api.post(`/requests/${other.requestId}/close`);
    expect(closed.status).toBe(201);

    const anon = apiClient(app.url);
    const toItem = await anon.post(`/upload/${other.uploadToken}/documents`, {
      requestItemId: detail.items[0].id,
      files: [{ fileName: 'nota.png', contentType: 'image/png', sizeBytes: 10 }],
    });
    expect(toItem.status).toBe(422);
    expect(toItem.body.error.message).toBe(
      'Esta solicitação foi encerrada: os itens não aceitam mais envios. Envie como Documento Extra.',
    );

    const asExtra = await anon.post(`/upload/${other.uploadToken}/documents`, {
      files: [{ fileName: 'atrasado.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    expect(asExtra.status).toBe(201);
    expect(asExtra.body.data.files[0].accepted).toBe(true);
  });

  it('confirmar sem PUT → recusado e a reserva é descartada', async () => {
    const anon = apiClient(app.url);
    const presigned = await anon.post(`/upload/${box.uploadToken}/documents`, {
      files: [{ fileName: 'sem-put.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    const [slot] = presigned.body.data.files;

    const res = await anon.post(`/upload/${box.uploadToken}/documents/confirm`, {
      documentIds: [slot.documentId],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      confirmed: 0,
      submittedItemIds: [],
      refused: [
        {
          documentId: slot.documentId,
          fileName: 'sem-put.csv',
          reason: 'Arquivo não chegou ao storage.',
        },
      ],
    });

    const rows = await db
      .select({ id: document.id })
      .from(document)
      .where(eq(document.id, slot.documentId));
    expect(rows).toHaveLength(0);
  });

  it('tamanho real diferente do declarado → recusado na confirmação', async () => {
    const anon = apiClient(app.url);
    const presigned = await anon.post(`/upload/${box.uploadToken}/documents`, {
      files: [{ fileName: 'mentira.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    const [slot] = presigned.body.data.files;
    await putFile(slot.uploadUrl, 'ab;cd');

    const res = await anon.post(`/upload/${box.uploadToken}/documents/confirm`, {
      documentIds: [slot.documentId],
    });
    expect(res.body.data.refused).toEqual([
      {
        documentId: slot.documentId,
        fileName: 'mentira.csv',
        reason: 'O arquivo enviado (5 bytes) não tem o tamanho declarado (10 bytes).',
      },
    ]);
  });

  it('conteúdo que não bate com a extensão declarada → recusado', async () => {
    const anon = apiClient(app.url);
    const presigned = await anon.post(`/upload/${box.uploadToken}/documents`, {
      files: [
        { fileName: 'nota.pdf', contentType: 'application/pdf', sizeBytes: CSV_CONTENT.length },
      ],
    });
    const [slot] = presigned.body.data.files;
    await putFile(slot.uploadUrl, CSV_CONTENT);

    const res = await anon.post(`/upload/${box.uploadToken}/documents/confirm`, {
      documentIds: [slot.documentId],
    });
    expect(res.body.data.refused[0].reason).toBe(
      'O conteúdo do arquivo não corresponde ao formato declarado.',
    );
  });

  it('confirmar de novo ou confirmar documento de outra solicitação → 404', async () => {
    const anon = apiClient(app.url);
    const { documentId } = await uploadVia(box.uploadToken, {
      fileName: 'confirmado.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    });

    const again = await anon.post(`/upload/${box.uploadToken}/documents/confirm`, {
      documentIds: [documentId],
    });
    expect(again.status, 'documento já confirmado não é reconfirmável').toBe(404);
    expect(again.body.error.message).toBe('Nenhum documento deste envio foi encontrado.');

    /* reserva viva em OUTRA solicitação da mesma firma: o token não a alcança */
    const foreignPresign = await anon.post(
      `/upload/${fixture.boxes.FechadaUp.uploadToken}/documents`,
      { files: [{ fileName: 'alheio.csv', contentType: 'text/csv', sizeBytes: 10 }] },
    );
    const foreignId = foreignPresign.body.data.files[0].documentId;

    const crossRequest = await anon.post(`/upload/${box.uploadToken}/documents/confirm`, {
      documentIds: [foreignId],
    });
    expect(crossRequest.status).toBe(404);
    expect(crossRequest.body.error.code).toBe('NOT_FOUND');
  });
});

describe('throttle próprio do upload — 60/60s por ip:token', () => {
  it('a 61ª no mesmo link → 429; outro link no mesmo IP tem balde próprio', async () => {
    const fixture = await openFirm(['Trava', 'Livre']);
    const anon = apiClient(app.url);
    const presignBody = {
      files: [{ fileName: 'virus.exe', contentType: 'application/pdf', sizeBytes: 10 }],
    };

    for (let attempt = 0; attempt < 60; attempt++) {
      const res = await anon.post(
        `/upload/${fixture.boxes.Trava.uploadToken}/documents`,
        presignBody,
      );
      expect(res.status, `presign ${attempt + 1} dentro do limite`).toBe(201);
    }

    const blocked = await anon.post(
      `/upload/${fixture.boxes.Trava.uploadToken}/documents`,
      presignBody,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');

    const otherToken = await anon.post(
      `/upload/${fixture.boxes.Livre.uploadToken}/documents`,
      presignBody,
    );
    expect(otherToken.status, 'balde é por token, não só por IP').toBe(201);
  });
});

describe('zip e leitura de documentos', () => {
  let fixture: Awaited<ReturnType<typeof openFirm>>;
  let zippedBox: Box;
  let emptyBox: Box;
  let extraId: string;
  let itemDocId: string;

  const zipGet = (path: string) => rawRequest('GET', path, { cookie: fixture.firm.cookie });

  beforeAll(async () => {
    fixture = await openFirm(['Vazia', 'Zipada']);
    zippedBox = fixture.boxes.Zipada;
    emptyBox = fixture.boxes.Vazia;

    const detail = await requestDetail(fixture.firm.api, zippedBox.requestId);
    ({ documentId: itemDocId } = await uploadVia(
      zippedBox.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      detail.items[0].id,
    ));
    ({ documentId: extraId } = await uploadVia(zippedBox.uploadToken, {
      fileName: 'extrato.csv',
      content: CSV_CONTENT,
      contentType: 'text/csv',
    }));
  });

  it('zip da solicitação aberta entrega tudo que não foi recusado', async () => {
    const res = await zipGet(`/requests/${zippedBox.requestId}/zip`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/zip');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="zipada-2026-09.zip"',
    );

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(countZipEntries(buffer)).toBe(2);
    expect(buffer.includes('Notas fiscais emitidas/')).toBe(true);
    expect(buffer.includes('Documentos Extra/')).toBe(true);
  });

  it('rejeitado sai do pacote; encerrada, só o aceito entra', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const accepted = await api.post(`/documents/${extraId}/review-extra`, {
      decision: 'accepted',
    });
    expect(accepted.status).toBe(201);
    const rejected = await api.post(`/documents/${itemDocId}/reject`, { rejectionReason: REASON });
    expect(rejected.status).toBe(201);

    const open = await zipGet(`/requests/${zippedBox.requestId}/zip`);
    expect(open.status).toBe(200);
    expect(countZipEntries(Buffer.from(await open.arrayBuffer()))).toBe(1);

    const closed = await api.post(`/requests/${zippedBox.requestId}/close`);
    expect(closed.status).toBe(201);

    const afterClose = await zipGet(`/requests/${zippedBox.requestId}/zip`);
    expect(afterClose.status).toBe(200);
    expect(countZipEntries(Buffer.from(await afterClose.arrayBuffer()))).toBe(1);
  });

  it('solicitação sem documentos → 404', async () => {
    const res = await zipGet(`/requests/${emptyBox.requestId}/zip`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe('Nenhum documento disponível para baixar.');
  });

  it('download concorrente do mesmo zip → 409 ZIP_ALREADY_IN_FLIGHT', async () => {
    /* arquivo grande o bastante para não caber nos buffers de socket: enquanto o primeiro
     * stream não é lido, a chave do voo fica ocupada */
    const bigContent = 'linha;100,00\n'.repeat(500_000);
    await uploadVia(emptyBox.uploadToken, {
      fileName: 'grande.csv',
      content: bigContent,
      contentType: 'text/csv',
    });

    const first = await zipGet(`/requests/${emptyBox.requestId}/zip`);
    expect(first.status).toBe(200);

    const concurrent = await zipGet(`/requests/${emptyBox.requestId}/zip`);
    expect(concurrent.status).toBe(409);
    const conflictBody = await concurrent.json();
    expect(conflictBody.error.code).toBe('ZIP_ALREADY_IN_FLIGHT');

    const buffer = Buffer.from(await first.arrayBuffer());
    expect(countZipEntries(buffer)).toBe(1);
    expect(buffer.length).toBeGreaterThan(Buffer.byteLength(bigContent));

    /* a chave solta quando o stream fecha no servidor — um tick depois do último byte */
    let released: Response | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      released = await zipGet(`/requests/${emptyBox.requestId}/zip`);
      if (released.status === 200) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(released!.status).toBe(200);
    await released!.arrayBuffer();
  });

  it('zip da competência agrupa por empresa (trial tem a capability)', async () => {
    const res = await zipGet(`/periods/${fixture.periodId}/zip`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="competencia-2026-09-2026-09.zip"',
    );

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(countZipEntries(buffer)).toBe(2);
    expect(buffer.includes('Zipada/')).toBe(true);
    expect(buffer.includes('Vazia/')).toBe(true);
  });

  it('competência acima de 2000 documentos → 422 ZIP_TOO_LARGE', async () => {
    const api = sessionClient(fixture.firm.cookie);
    const opened = await api.post('/periods', { referenceMonth: '2026-10' });
    expect(opened.status, JSON.stringify(opened.body)).toBe(201);
    const octoberRequestId = opened.body.data.requests.find(
      (row: any) => row.companyName === 'Zipada',
    ).id;

    await db.insert(document).values(
      Array.from({ length: 2001 }, (_, index) => ({
        requestId: octoberRequestId,
        storageKey: `fake/${index}`,
        fileName: `doc-${index}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 10,
        uploadStatus: 'uploaded',
        uploadedAt: new Date(),
      })),
    );

    const res = await zipGet(`/periods/${opened.body.data.id}/zip`);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('ZIP_TOO_LARGE');
    expect(body.error.message).toBe(
      'Esta competência tem 2001 documentos e o pacote único vai até 2000. Baixe por Empresa.',
    );
  });

  it('plano sem a capability periodZip → 402 antes de qualquer lookup', async () => {
    const gated = await registerFirm(app.url);
    const me = await gated.api.get('/auth/me');
    expect(me.status).toBe(200);
    await db
      .update(subscription)
      .set({ planName: 'essencial' })
      .where(eq(subscription.accountingFirmId, me.body.data.accountingFirm.id));

    const res = await gated.api.get(`/periods/${GHOST_ID}/zip`);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PLAN_CAPABILITY_REQUIRED');
    expect(res.body.error.message).toBe(
      'Este recurso está disponível a partir do plano Profissional.',
    );
    expect(res.body.error.details).toEqual({
      capability: 'periodZip',
      requiredPlan: 'profissional',
    });
  });

  it('GET /documents/:id/content serve csv como anexo e png inline', async () => {
    const csv = await zipGet(`/documents/${extraId}/content`);
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toContain('attachment');
    expect(await csv.text()).toBe(CSV_CONTENT);

    const png = await zipGet(`/documents/${itemDocId}/content`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toContain('image/png');
    expect(png.headers.get('content-disposition')).toContain('inline');
  });

  it('content-type fora da allowlist vira octet-stream attachment', async () => {
    const { documentId } = await uploadVia(emptyBox.uploadToken, {
      fileName: 'tabela.csv',
      content: CSV_CONTENT,
      contentType: 'text/html',
    });

    const res = await zipGet(`/documents/${documentId}/content`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/octet-stream');
    expect(res.headers.get('content-disposition')).toContain('attachment');
  });

  it('linha de presign sem upload não tem conteúdo → 404', async () => {
    const presigned = await apiClient(app.url).post(`/upload/${emptyBox.uploadToken}/documents`, {
      files: [{ fileName: 'fantasma.csv', contentType: 'text/csv', sizeBytes: 10 }],
    });
    const ghostId = presigned.body.data.files[0].documentId;

    const res = await zipGet(`/documents/${ghostId}/content`);
    expect(res.status).toBe(404);
  });
});

describe('prazos estourados — POST /deadlines/scan e o cron diário', () => {
  let scoped: Awaited<ReturnType<typeof openFirm>>;
  let swept: Awaited<ReturnType<typeof openFirm>>;
  let lateItemId: string;
  let onTimeItemId: string;
  let cronItemId: string;
  let staleDocumentId: string;

  const stampOf = async (itemId: string) => {
    const [row] = await db
      .select({ deadlineNotifiedAt: requestItem.deadlineNotifiedAt })
      .from(requestItem)
      .where(eq(requestItem.id, itemId));
    return row.deadlineNotifiedAt;
  };

  beforeAll(async () => {
    scoped = await openFirm(['Atrasada', 'EmDia']);
    swept = await openFirm(['Cron']);

    const lateDetail = await requestDetail(scoped.firm.api, scoped.boxes.Atrasada.requestId);
    lateItemId = lateDetail.items[0].id;
    const onTimeDetail = await requestDetail(scoped.firm.api, scoped.boxes.EmDia.requestId);
    onTimeItemId = onTimeDetail.items[0].id;
    const cronDetail = await requestDetail(swept.firm.api, swept.boxes.Cron.requestId);
    cronItemId = cronDetail.items[0].id;

    /* datas plantadas: o `brazilDay()` do scan é o relógio real */
    await db
      .update(requestItem)
      .set({ dueDate: '2000-01-01' })
      .where(eq(requestItem.id, lateItemId));
    await db
      .update(requestItem)
      .set({ dueDate: '2099-01-01' })
      .where(eq(requestItem.id, onTimeItemId));
    await db
      .update(requestItem)
      .set({ dueDate: '2000-01-01' })
      .where(eq(requestItem.id, cronItemId));

    /* reserva órfã de mais de 24h: a faxina do cron precisa descartá-la */
    const presigned = await apiClient(app.url).post(
      `/upload/${swept.boxes.Cron.uploadToken}/documents`,
      { files: [{ fileName: 'orfao.csv', contentType: 'text/csv', sizeBytes: 10 }] },
    );
    staleDocumentId = presigned.body.data.files[0].documentId;
    await db
      .update(document)
      .set({ createdAt: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(document.id, staleDocumentId));
  });

  it('scan avisa uma vez por solicitação: contato + contador, e carimba o item', async () => {
    const box = scoped.boxes.Atrasada;
    const hashBefore = await linkHashOf(box.requestId);

    const res = await scoped.firm.api.post('/deadlines/scan');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      overdue: 1,
      alreadyNotified: 0,
      notified: [
        {
          requestItemId: lateItemId,
          itemName: 'Notas fiscais emitidas',
          companyName: 'Atrasada',
          dueDate: '2000-01-01',
        },
      ],
    });

    expect(await stampOf(lateItemId)).not.toBeNull();
    expect(await stampOf(onTimeItemId)).toBeNull();
    expect(await stampOf(cronItemId), 'scan é escopado: outra firma intocada').toBeNull();

    expect(await linkHashOf(box.requestId), 'o link é rotacionado junto do aviso').not.toBe(
      hashBefore,
    );

    const notices = await messagesFor(box.requestId, 'deadline_missed', 2);
    expect(notices.map((row) => row.recipient).sort()).toEqual(
      [box.contactEmail, scoped.firm.email].sort(),
    );
    expect(notices.every((row) => row.status === 'sent')).toBe(true);
  });

  it('segunda varredura não reavisa', async () => {
    const res = await scoped.firm.api.post('/deadlines/scan');
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ overdue: 1, alreadyNotified: 1, notified: [] });

    expect(await messagesFor(scoped.boxes.Atrasada.requestId, 'deadline_missed', 2)).toHaveLength(
      2,
    );
  });

  it('rejeição reabre o item e o prazo estourado volta a avisar', async () => {
    const api = sessionClient(scoped.firm.cookie);
    const box = scoped.boxes.Atrasada;

    /* o token original sobrevive à rotação do scan pela carência de 48h */
    const { documentId } = await uploadVia(
      box.uploadToken,
      { fileName: 'nota.png', content: PNG_1X1, contentType: 'image/png' },
      lateItemId,
    );

    const whileSubmitted = await api.post('/deadlines/scan');
    expect(whileSubmitted.body.data, 'submitted não é prazo estourado').toMatchObject({
      overdue: 0,
    });

    const rejected = await api.post(`/documents/${documentId}/reject`, {
      rejectionReason: REASON,
    });
    expect(rejected.status).toBe(201);

    const res = await api.post('/deadlines/scan');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ overdue: 1, alreadyNotified: 0 });
    expect(res.body.data.notified).toHaveLength(1);

    expect(await messagesFor(box.requestId, 'deadline_missed', 4)).toHaveLength(4);
  });

  it('o cron diário varre todas as firmas e descarta reservas órfãs', async () => {
    const box = swept.boxes.Cron;

    await app.runDeadlineSweep();

    expect(await stampOf(cronItemId)).not.toBeNull();

    const notices = await messagesFor(box.requestId, 'deadline_missed', 2);
    expect(notices.map((row) => row.recipient).sort()).toEqual(
      [box.contactEmail, swept.firm.email].sort(),
    );

    const staleRows = await db
      .select({ id: document.id })
      .from(document)
      .where(eq(document.id, staleDocumentId));
    expect(staleRows, 'presign de mais de 24h sem PUT é removido').toHaveLength(0);
  });

  it('segundo sweep não duplica avisos', async () => {
    await app.runDeadlineSweep();

    expect(await messagesFor(swept.boxes.Cron.requestId, 'deadline_missed', 2)).toHaveLength(2);
  });
});

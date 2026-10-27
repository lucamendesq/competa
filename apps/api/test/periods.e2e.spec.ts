import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import { message, uploadLink } from '../src/infra/database/schema/index.js';
import {
  apiClient,
  contactBody,
  createCompany,
  createTemplate,
  documentTypeIds,
  registerFirm,
  type Api,
} from './support/fixtures.js';

/* Competência fixa: 2026-09. Offset default 1 → vencimentos em outubro/2026
 * (01/10 qui; 02/10 sex; 03/10 sáb; 04/10 dom; 05/10 seg). */
const REFERENCE_MONTH = '2026-09';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

describe('autorização', () => {
  it('todas as rotas exigem sessão (401 UNAUTHENTICATED)', async () => {
    const anon = apiClient(app.url);
    const id = '018f0000-0000-7000-8000-000000000000';

    for (const res of await Promise.all([
      anon.post('/periods', { referenceMonth: REFERENCE_MONTH }),
      anon.get('/periods'),
      anon.get(`/periods/${id}`),
      anon.get(`/periods/${id}/requests`),
      anon.get(`/periods/${id}/pending-panel`),
      anon.post(`/periods/${id}/close`),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});

type OpenedPeriod = {
  id: string;
  referenceMonth: string;
  status: string;
  dueDate: string | null;
  warnings: Array<{ companyId: string; companyName: string; reason: string; blockedBy: string }>;
  requests: Array<{
    id: string;
    companyId: string;
    companyName: string;
    itemCount: number;
    uploadUrl: string;
  }>;
};

describe('POST /periods — fan-out', () => {
  let api: Api;
  let opened: OpenedPeriod;
  let companies: Record<string, { id: string }>;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    const [dt1, dt2, dt3, dt4] = await documentTypeIds(api, 4);
    const templateId = await createTemplate(api, [
      { documentTypeId: dt1, dueDay: 5 },
      { documentTypeId: dt2, dueDay: 4 },
      { documentTypeId: dt3 },
      { documentTypeId: dt4, periodicity: 'annual', annualMonth: 3 },
    ]);

    companies = {
      alpha: await createCompany(api, {
        name: 'Alpha',
        checklistTemplateId: templateId,
        contact: contactBody('Ana'),
      }),
      beta: await createCompany(api, { name: 'Beta', contact: contactBody('Bruno') }),
      gama: await createCompany(api, { name: 'Gama', checklistTemplateId: templateId }),
      delta: await createCompany(api, {
        name: 'Delta',
        checklistTemplateId: templateId,
        contact: contactBody('Diana'),
      }),
      eco: await createCompany(api, {
        name: 'Eco',
        checklistTemplateId: templateId,
        contact: contactBody('Edu'),
      }),
    };
    const second = await api.post(`/companies/${companies.delta.id}/contacts`, contactBody('Davi'));
    expect(second.status).toBe(201);
    const deactivate = await api.patch(`/companies/${companies.eco.id}`, { active: false });
    expect(deactivate.status).toBe(200);

    const res = await api.post('/periods', { referenceMonth: REFERENCE_MONTH });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    opened = res.body.data;
  });

  it('cria a competência normalizada para o dia 1', () => {
    expect(opened.referenceMonth).toBe(`${REFERENCE_MONTH}-01`);
    expect(opened.status).toBe('open');
    expect(opened.dueDate).toBeNull();
  });

  it('gera solicitação só para empresa ativa com checklist e responsável', () => {
    expect(opened.requests).toHaveLength(2);
    const byName = Object.fromEntries(opened.requests.map((r) => [r.companyName, r]));

    expect(byName.Alpha.companyId).toBe(companies.alpha.id);
    expect(byName.Alpha.itemCount).toBe(3);
    expect(byName.Delta.itemCount).toBe(3);
    expect(byName.Eco).toBeUndefined();
  });

  it('entrega o link de upload em claro só na resposta; no banco fica o hash', async () => {
    for (const req of opened.requests) {
      expect(req.uploadUrl).toMatch(/^http:\/\/localhost:5173\/envio\/.+/);
    }

    const token = opened.requests[0].uploadUrl.split('/envio/')[1];
    const rows = await db
      .select({ requestId: uploadLink.requestId, tokenHash: uploadLink.tokenHash })
      .from(uploadLink)
      .where(eq(uploadLink.requestId, opened.requests[0].id));

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toHaveLength(64);
  });

  it('avisa empresa sem template, sem responsável e com responsáveis demais', () => {
    const byCompany = Object.fromEntries(opened.warnings.map((w) => [w.companyName, w]));

    expect(opened.warnings).toHaveLength(3);
    expect(byCompany.Beta.blockedBy).toBe('template');
    expect(byCompany.Beta.reason).toContain('sem template');
    expect(byCompany.Gama.blockedBy).toBe('contact');
    expect(byCompany.Gama.reason).toContain('sem Responsável');
    expect(byCompany.Delta.blockedBy).toBe('contact');
    expect(byCompany.Delta.reason).toContain('2 Responsáveis');
    expect(byCompany.Delta.reason).toContain('Diana');
  });

  it('item anual fora do mês não entra; vencimento cai no dia útil anterior', async () => {
    const res = await api.get(`/periods/${opened.id}/pending-panel`);
    expect(res.status).toBe(200);

    const panel: Array<{
      companyName: string;
      counts: Record<string, number>;
      missing: Array<{ dueDate: string | null }>;
      requestStatus: string;
      responsibleAccountantName: string | null;
      channelFailures: unknown[];
    }> = res.body.data;
    const alpha = panel.find((row) => row.companyName === 'Alpha')!;
    expect(alpha.counts).toEqual({ pending: 3, submitted: 0, accepted: 0, rejected: 0 });

    const dueDates = alpha.missing.map((item) => item.dueDate).sort();
    expect(dueDates.filter(Boolean)).toEqual(['2026-10-02', '2026-10-05']);
    expect(dueDates.filter((d: string | null) => d === null)).toHaveLength(1);

    expect(alpha.requestStatus).toBe('open');
    expect(alpha.responsibleAccountantName).toBeNull();
    expect(alpha.channelFailures).toEqual([]);
    expect(res.body.data).toHaveLength(2);
  });

  it('emite RequestCreated: cada solicitação ganha entrega de link registrada', async () => {
    const requestIds = opened.requests.map((r) => r.id);

    /* O listener é fire-and-forget: a resposta volta antes do insert do message. */
    await app.drainEvents();
    const rows = await db
      .select({ requestId: message.requestId, purpose: message.purpose })
      .from(message)
      .where(inArray(message.requestId, requestIds));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.purpose === 'link_delivery')).toBe(true);
  });

  it('mesma competência duas vezes → 409 PERIOD_ALREADY_OPEN', async () => {
    const res = await api.post('/periods', { referenceMonth: REFERENCE_MONTH });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PERIOD_ALREADY_OPEN');
    expect(res.body.error.message).toContain(REFERENCE_MONTH);
  });
});

describe('listagem, detalhe e encerramento', () => {
  let api: Api;
  let periodId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    const [dt1] = await documentTypeIds(api, 1);
    const templateId = await createTemplate(api, [{ documentTypeId: dt1, dueDay: 5 }]);
    await createCompany(api, {
      name: 'Única',
      checklistTemplateId: templateId,
      contact: contactBody(),
    });

    const sep = await api.post('/periods', {
      referenceMonth: REFERENCE_MONTH,
      dueDate: '2026-10-10',
    });
    expect(sep.status).toBe(201);
    periodId = sep.body.data.id;
    const oct = await api.post('/periods', { referenceMonth: '2026-10' });
    expect(oct.status).toBe(201);
  });

  it('GET /periods pagina com meta e ordena por competência', async () => {
    const res = await api.get('/periods?page=1&perPage=1');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, perPage: 1, total: 2 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      referenceMonth: `${REFERENCE_MONTH}-01`,
      status: 'open',
      dueDate: '2026-10-10',
      requestCount: 1,
    });

    const page2 = await api.get('/periods?page=2&perPage=1');
    expect(page2.body.data[0].referenceMonth).toBe('2026-10-01');
  });

  it('GET /periods/:id devolve contadores', async () => {
    const res = await api.get(`/periods/${periodId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: periodId,
      referenceMonth: `${REFERENCE_MONTH}-01`,
      status: 'open',
      dueDate: '2026-10-10',
      requestCount: 1,
      completeRequestCount: 0,
      pendingItemCount: 1,
    });
  });

  it('GET /periods/:id/requests — array puro sem paginação, meta com paginação', async () => {
    const plain = await api.get(`/periods/${periodId}/requests`);
    expect(plain.status).toBe(200);
    expect(plain.body.meta).toBeUndefined();
    expect(plain.body.data).toHaveLength(1);
    expect(plain.body.data[0]).toMatchObject({
      companyName: 'Única',
      status: 'open',
      itemCount: 1,
      pendingItemCount: 1,
    });

    const paged = await api.get(`/periods/${periodId}/requests?page=1&perPage=10`);
    expect(paged.status).toBe(200);
    expect(paged.body.meta).toEqual({ page: 1, perPage: 10, total: 1 });
    expect(paged.body.data).toHaveLength(1);
  });

  /* Paginação inválida é erro DO CLIENTE: 422 com o caminho do campo, igual a toda outra
   * rota. O 500 vinha de um `.parse()` cru, cujo `ZodError` não casa com nenhum ramo do mapa
   * de erros. */
  it('paginação mal formada em :id/requests → 422 com o campo apontado', async () => {
    const res = await api.get(`/periods/${periodId}/requests?page=abc`);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details?.some((issue: any) => issue.path.includes('page'))).toBe(true);
  });

  it('id desconhecido → 404 NOT_FOUND; id mal formado → 422', async () => {
    const ghost = '018f0000-0000-7000-8000-00000000dead';

    for (const res of await Promise.all([
      api.get(`/periods/${ghost}`),
      api.get(`/periods/${ghost}/requests`),
      api.get(`/periods/${ghost}/pending-panel`),
      api.post(`/periods/${ghost}/close`),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }

    const malformed = await api.get('/periods/nao-e-uuid');
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /periods/:id/close encerra solicitações e avisa itens sem aceite', async () => {
    const res = await api.post(`/periods/${periodId}/close`);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: periodId,
      status: 'closed',
      closedRequestCount: 1,
      pendingItemCount: 1,
    });
    expect(res.body.data.warning).toBe('Competência encerrada com 1 item(ns) sem aceite.');

    const after = await api.get(`/periods/${periodId}`);
    expect(after.body.data.status).toBe('closed');
  });

  it('encerrar de novo → 409 PERIOD_ALREADY_CLOSED; reabrir o mês → 409 PERIOD_ALREADY_OPEN', async () => {
    const again = await api.post(`/periods/${periodId}/close`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PERIOD_ALREADY_CLOSED');

    const reopen = await api.post('/periods', { referenceMonth: REFERENCE_MONTH });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.code).toBe('PERIOD_ALREADY_OPEN');
  });
});

describe('firma sem empresas e validação', () => {
  let api: Api;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  it('abre competência vazia: sem solicitações, sem avisos', async () => {
    const res = await api.post('/periods', { referenceMonth: REFERENCE_MONTH });
    expect(res.status).toBe(201);
    expect(res.body.data.requests).toEqual([]);
    expect(res.body.data.warnings).toEqual([]);
  });

  it('encerrar competência sem pendência não traz aviso', async () => {
    const list = await api.get('/periods?page=1&perPage=10');
    const res = await api.post(`/periods/${list.body.data[0].id}/close`);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ closedRequestCount: 0, pendingItemCount: 0 });
    expect(res.body.data.warning).toBeNull();
  });

  it('aceita YYYY-MM-DD e normaliza para o dia 1', async () => {
    const res = await api.post('/periods', { referenceMonth: '2026-11-15' });
    expect(res.status).toBe(201);
    expect(res.body.data.referenceMonth).toBe('2026-11-01');
  });

  it('corpo inválido → 422 VALIDATION_ERROR com issues', async () => {
    for (const body of [
      { referenceMonth: 'set/2026' },
      { referenceMonth: '2026-13' },
      { referenceMonth: REFERENCE_MONTH, dueDate: 'amanhã' },
      {},
    ]) {
      const res = await api.post('/periods', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });
});

describe('isolamento entre firmas', () => {
  it('competência de uma firma é invisível para outra', async () => {
    const [a, b] = await Promise.all([registerFirm(app.url), registerFirm(app.url)]);

    const opened = await a.api.post('/periods', { referenceMonth: REFERENCE_MONTH });
    expect(opened.status).toBe(201);
    const periodId = opened.body.data.id;

    for (const res of await Promise.all([
      b.api.get(`/periods/${periodId}`),
      b.api.get(`/periods/${periodId}/requests`),
      b.api.get(`/periods/${periodId}/pending-panel`),
      b.api.post(`/periods/${periodId}/close`),
    ])) {
      expect(res.status).toBe(404);
    }

    const list = await b.api.get('/periods?page=1&perPage=10');
    expect(list.body.data).toEqual([]);
  });
});

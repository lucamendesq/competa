import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import {
  accountant,
  checklistTemplateItem,
  companyChecklistOverride,
  documentType,
} from '../src/infra/database/schema/index.js';
import {
  apiClient,
  createCompany,
  createTemplate,
  documentTypeIds,
  registerFirm,
  type Api,
} from './support/fixtures.js';

/* Template do produto seedado por 001-document-types-and-templates (10 itens). */
const MEI_TEMPLATE_ID = '01a06884-975a-7e02-a389-b50449a5afe3';
const GHOST_ID = '018f0000-0000-7000-8000-00000000dead';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

async function firmIdOf(authUserId: string): Promise<string> {
  const [row] = await db
    .select({ accountingFirmId: accountant.accountingFirmId })
    .from(accountant)
    .where(eq(accountant.authUserId, authUserId));
  expect(row).toBeDefined();

  return row.accountingFirmId;
}

type DocumentTypeRow = { id: string; name: string; category: string };

async function documentTypeRows(api: Api, count: number): Promise<DocumentTypeRow[]> {
  const res = await api.get('/document-types?perPage=100');
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBeGreaterThanOrEqual(count);

  return res.body.data.slice(0, count);
}

describe('autorização', () => {
  it('todas as rotas exigem sessão (401 UNAUTHENTICATED)', async () => {
    const anon = apiClient(app.url);
    const id = GHOST_ID;

    for (const res of await Promise.all([
      anon.get('/document-types'),
      anon.get('/checklist-templates'),
      anon.get(`/checklist-templates/${id}`),
      anon.post('/checklist-templates', { name: 'X' }),
      anon.post(`/checklist-templates/${id}/derive`, {}),
      anon.patch(`/checklist-templates/${id}`, { name: 'X' }),
      anon.delete(`/checklist-templates/${id}`),
      anon.post(`/checklist-templates/${id}/items`, { documentTypeId: id }),
      anon.patch(`/checklist-templates/${id}/items/${id}`, { dueDay: 5 }),
      anon.delete(`/checklist-templates/${id}/items/${id}`),
      anon.get(`/companies/${id}/checklist`),
      anon.get(`/companies/${id}/checklist-overrides`),
      anon.put(`/companies/${id}/checklist-overrides`, { documentTypeId: id, action: 'add' }),
      anon.delete(`/companies/${id}/checklist-overrides/${id}`),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('GET /document-types', () => {
  let api: Api;
  let other: Api;

  beforeAll(async () => {
    const firm = await registerFirm(app.url);
    api = firm.api;
    ({ api: other } = await registerFirm(app.url));

    await db.insert(documentType).values({
      accountingFirmId: await firmIdOf(firm.userId),
      name: 'ZZZ Tipo próprio',
      category: 'corporate',
      acceptedFormats: ['pdf', 'xml'],
      description: 'Só desta firma',
    });
  });

  it('pagina o catálogo seedado, ordenado por categoria e nome', async () => {
    const res = await other.get('/document-types');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, perPage: 20, total: 38 });
    expect(res.body.data).toHaveLength(20);
    expect(res.body.data.every((row: any) => row.isProduct === true)).toBe(true);

    const categories = res.body.data.map((row: any) => row.category);
    expect(categories).toEqual([...categories].sort());

    const page2 = await other.get('/document-types?page=2&perPage=20');
    expect(page2.body.meta).toEqual({ page: 2, perPage: 20, total: 38 });
    expect(page2.body.data).toHaveLength(18);
  });

  it('filtra por categoria', async () => {
    const res = await other.get('/document-types?category=fiscal&perPage=100');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(8);
    expect(res.body.data.every((row: any) => row.category === 'fiscal')).toBe(true);
  });

  it('tipo próprio aparece só para a firma dona, com isProduct false', async () => {
    const mine = await api.get('/document-types?category=corporate&perPage=100');
    expect(mine.status).toBe(200);
    expect(mine.body.meta.total).toBe(7);
    const own = mine.body.data.find((row: any) => row.name === 'ZZZ Tipo próprio');
    expect(own).toMatchObject({
      isProduct: false,
      acceptedFormats: ['pdf', 'xml'],
      description: 'Só desta firma',
    });

    const foreign = await other.get('/document-types?category=corporate&perPage=100');
    expect(foreign.body.meta.total).toBe(6);
    expect(foreign.body.data.some((row: any) => row.name === 'ZZZ Tipo próprio')).toBe(false);
  });

  it('query inválida → 422 VALIDATION_ERROR', async () => {
    for (const qs of ['?category=bogus', '?page=0', '?perPage=101']) {
      const res = await api.get(`/document-types${qs}`);
      expect(res.status, qs).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });
});

describe('checklist-templates — listagem e detalhe', () => {
  let api: Api;
  let ownTemplateId: string;
  let companyId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    ownTemplateId = await createTemplate(api, []);
    ({ id: companyId } = await createCompany(api, {
      name: 'Vinculada',
      checklistTemplateId: ownTemplateId,
    }));
  });

  it('lista templates do produto e os próprios com contadores', async () => {
    const res = await api.get('/checklist-templates');
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeUndefined();

    const products = res.body.data.filter((row: any) => row.isProduct);
    expect(products.map((row: any) => row.name).sort()).toEqual([
      'Template Lucro Presumido',
      'Template Lucro Real',
      'Template MEI',
      'Template Simples — Comércio',
      'Template Simples — Serviços',
    ]);
    const mei = products.find((row: any) => row.id === MEI_TEMPLATE_ID);
    expect(mei).toMatchObject({ itemCount: 10, companyCount: 0, derivedFrom: null });

    const own = res.body.data.find((row: any) => row.id === ownTemplateId);
    expect(own).toMatchObject({ isProduct: false, itemCount: 0, companyCount: 1 });
  });

  it('companyCount conta só empresa ativa', async () => {
    const off = await api.patch(`/companies/${companyId}`, { active: false });
    expect(off.status).toBe(200);

    const res = await api.get('/checklist-templates');
    const own = res.body.data.find((row: any) => row.id === ownTemplateId);
    expect(own.companyCount).toBe(0);
  });

  it('GET :id devolve o template (inclusive global) com itens', async () => {
    const res = await api.get(`/checklist-templates/${MEI_TEMPLATE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: MEI_TEMPLATE_ID,
      name: 'Template MEI',
      accountingFirmId: null,
      derivedFrom: null,
    });
    expect(res.body.data.items).toHaveLength(10);

    const byName = Object.fromEntries(res.body.data.items.map((item: any) => [item.name, item]));
    expect(byName['Notas fiscais emitidas']).toMatchObject({
      category: 'fiscal',
      periodicity: 'monthly',
      annualMonth: null,
      dueDay: 5,
      dueMonthOffset: 1,
      conditionFlag: null,
      required: true,
    });
    expect(byName['Relatório anual de receitas (MEI)']).toMatchObject({
      periodicity: 'annual',
      annualMonth: 12,
    });
    expect(byName['Variáveis da folha']).toMatchObject({
      conditionFlag: 'has_employees',
      dueDay: 25,
      dueMonthOffset: 0,
    });

    const categories = res.body.data.items.map((item: any) => item.category);
    expect(categories).toEqual([...categories].sort());
  });

  it('id desconhecido → 404 NOT_FOUND; mal formado → 422', async () => {
    const ghost = await api.get(`/checklist-templates/${GHOST_ID}`);
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe('NOT_FOUND');

    const malformed = await api.get('/checklist-templates/nao-e-uuid');
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('checklist-templates — criar, derivar e renomear', () => {
  let api: Api;
  let createdId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  it('POST cria template vazio da firma', async () => {
    const res = await api.post('/checklist-templates', { name: 'Meu Modelo' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Meu Modelo', derivedFrom: null, itemCount: 0 });
    expect(res.body.data.accountingFirmId).not.toBeNull();
    createdId = res.body.data.id;
  });

  it('nome repetido (variando caixa) → 409 TEMPLATE_NAME_TAKEN com details', async () => {
    const res = await api.post('/checklist-templates', { name: 'meu modelo' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_NAME_TAKEN');
    expect(res.body.error.details).toEqual([
      { path: ['name'], message: 'Já existe um template com este nome.' },
    ]);
  });

  it('corpo inválido → 422 VALIDATION_ERROR', async () => {
    for (const body of [{}, { name: '' }, { name: 'x'.repeat(121) }]) {
      const res = await api.post('/checklist-templates', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('derive copia os itens do template do produto; sem nome, herda o nome do original', async () => {
    const res = await api.post(`/checklist-templates/${MEI_TEMPLATE_ID}/derive`, {});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Template MEI',
      derivedFrom: MEI_TEMPLATE_ID,
      itemCount: 10,
    });

    const [detail, source] = await Promise.all([
      api.get(`/checklist-templates/${res.body.data.id}`),
      api.get(`/checklist-templates/${MEI_TEMPLATE_ID}`),
    ]);
    expect(detail.body.data.items).toHaveLength(10);
    const copied = detail.body.data.items.map((item: any) => item.documentTypeId).sort();
    expect(copied).toEqual(source.body.data.items.map((item: any) => item.documentTypeId).sort());
  });

  it('derivar de novo sem nome → 409 TEMPLATE_NAME_TAKEN (colide com a cópia anterior)', async () => {
    const res = await api.post(`/checklist-templates/${MEI_TEMPLATE_ID}/derive`, {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_NAME_TAKEN');
  });

  it('derive com nome explícito usa o nome enviado', async () => {
    const res = await api.post(`/checklist-templates/${MEI_TEMPLATE_ID}/derive`, {
      name: 'MEI Ajustado',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'MEI Ajustado', itemCount: 10 });
  });

  it('derivar template próprio → 409 TEMPLATE_ALREADY_OWNED', async () => {
    const res = await api.post(`/checklist-templates/${createdId}/derive`, { name: 'Outro' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_ALREADY_OWNED');
  });

  it('PATCH renomeia template próprio', async () => {
    const res = await api.patch(`/checklist-templates/${createdId}`, { name: 'Renomeado' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: createdId, name: 'Renomeado' });
  });

  it('renomear para nome já usado → 409 TEMPLATE_NAME_TAKEN', async () => {
    const res = await api.patch(`/checklist-templates/${createdId}`, { name: 'template mei' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_NAME_TAKEN');
  });

  it('renomear template GLOBAL → 409 TEMPLATE_IMMUTABLE', async () => {
    const res = await api.patch(`/checklist-templates/${MEI_TEMPLATE_ID}`, { name: 'Hackeado' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_IMMUTABLE');
  });

  it('PATCH id desconhecido → 404 NOT_FOUND', async () => {
    const res = await api.patch(`/checklist-templates/${GHOST_ID}`, { name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('checklist-templates — exclusão', () => {
  let api: Api;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  it('DELETE remove template próprio sem uso; itens caem em cascata', async () => {
    const [docId] = await documentTypeIds(api, 1);
    const templateId = await createTemplate(api, [{ documentTypeId: docId }]);

    const res = await api.delete(`/checklist-templates/${templateId}`);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();

    const after = await api.get(`/checklist-templates/${templateId}`);
    expect(after.status).toBe(404);

    const rows = await db
      .select({ id: checklistTemplateItem.id })
      .from(checklistTemplateItem)
      .where(eq(checklistTemplateItem.checklistTemplateId, templateId));
    expect(rows).toHaveLength(0);
  });

  it('DELETE template GLOBAL → 409 TEMPLATE_IMMUTABLE', async () => {
    const res = await api.delete(`/checklist-templates/${MEI_TEMPLATE_ID}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_IMMUTABLE');
  });

  it('em uso por empresa → 409 TEMPLATE_IN_USE; empresa inativa ainda bloqueia', async () => {
    const templateId = await createTemplate(api, []);
    const { id: companyId } = await createCompany(api, {
      name: 'Usa Template',
      checklistTemplateId: templateId,
    });

    const inUse = await api.delete(`/checklist-templates/${templateId}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('TEMPLATE_IN_USE');
    expect(inUse.body.error.message).toContain('1 empresa');

    const off = await api.patch(`/companies/${companyId}`, { active: false });
    expect(off.status).toBe(200);
    const still = await api.delete(`/checklist-templates/${templateId}`);
    expect(still.status).toBe(409);
    expect(still.body.error.code).toBe('TEMPLATE_IN_USE');
  });

  it('DELETE id desconhecido → 404 NOT_FOUND', async () => {
    const res = await api.delete(`/checklist-templates/${GHOST_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('itens de template', () => {
  let api: Api;
  let templateId: string;
  let otherTemplateId: string;
  let docs: string[];
  let defaultItemId: string;
  let annualItemId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    docs = await documentTypeIds(api, 5);
    templateId = await createTemplate(api, []);
    otherTemplateId = await createTemplate(api, []);
  });

  it('POST aplica os defaults do contrato', async () => {
    const res = await api.post(`/checklist-templates/${templateId}/items`, {
      documentTypeId: docs[0],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      checklistTemplateId: templateId,
      documentTypeId: docs[0],
      periodicity: 'monthly',
      annualMonth: null,
      dueDay: null,
      dueMonthOffset: 1,
      conditionFlag: null,
      required: true,
    });
    defaultItemId = res.body.data.id;
  });

  it('item anual exige annualMonth (422 com path); com o mês, cria', async () => {
    const missing = await api.post(`/checklist-templates/${templateId}/items`, {
      documentTypeId: docs[1],
      periodicity: 'annual',
    });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(missing.body.error.details[0].path).toEqual(['annualMonth']);

    const created = await api.post(`/checklist-templates/${templateId}/items`, {
      documentTypeId: docs[1],
      periodicity: 'annual',
      annualMonth: 12,
      dueDay: 5,
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ periodicity: 'annual', annualMonth: 12, dueDay: 5 });
    annualItemId = created.body.data.id;
  });

  it('conditionFlag do vocabulário entra; fora dele → 422', async () => {
    const flagged = await api.post(`/checklist-templates/${templateId}/items`, {
      documentTypeId: docs[2],
      conditionFlag: 'has_employees',
    });
    expect(flagged.status).toBe(201);
    expect(flagged.body.data.conditionFlag).toBe('has_employees');

    const bogus = await api.post(`/checklist-templates/${templateId}/items`, {
      documentTypeId: docs[3],
      conditionFlag: 'tem_gato',
    });
    expect(bogus.status).toBe(422);
    expect(bogus.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('mesmo tipo de documento duas vezes → 409 TEMPLATE_ITEM_DUPLICATED', async () => {
    const res = await api.post(`/checklist-templates/${templateId}/items`, {
      documentTypeId: docs[0],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_ITEM_DUPLICATED');
  });

  it('tipo de documento inexistente → 422 DOCUMENT_TYPE_NOT_VISIBLE', async () => {
    const res = await api.post(`/checklist-templates/${templateId}/items`, {
      documentTypeId: GHOST_ID,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DOCUMENT_TYPE_NOT_VISIBLE');
  });

  it('PATCH altera campos do item', async () => {
    const res = await api.patch(`/checklist-templates/${templateId}/items/${defaultItemId}`, {
      dueDay: 10,
      required: false,
      conditionFlag: 'has_inventory',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: defaultItemId,
      dueDay: 10,
      required: false,
      conditionFlag: 'has_inventory',
      periodicity: 'monthly',
    });
  });

  it('PATCH não deixa item anual sem mês', async () => {
    const nullOnly = await api.patch(`/checklist-templates/${templateId}/items/${annualItemId}`, {
      annualMonth: null,
    });
    expect(nullOnly.status).toBe(422);
    expect(nullOnly.body.error.code).toBe('VALIDATION_ERROR');
    expect(nullOnly.body.error.message).toContain('annualMonth');

    /* Mesmo com annualMonth já gravado no banco, virar annual exige reenviar o mês. */
    const toAnnual = await api.patch(`/checklist-templates/${templateId}/items/${annualItemId}`, {
      periodicity: 'annual',
    });
    expect(toAnnual.status).toBe(422);

    const toMonthly = await api.patch(`/checklist-templates/${templateId}/items/${annualItemId}`, {
      periodicity: 'monthly',
      annualMonth: null,
    });
    expect(toMonthly.status).toBe(200);
    expect(toMonthly.body.data).toMatchObject({ periodicity: 'monthly', annualMonth: null });
  });

  it('PATCH item de outro template da firma → 404 (vínculo template/item confere)', async () => {
    const res = await api.patch(`/checklist-templates/${otherTemplateId}/items/${defaultItemId}`, {
      dueDay: 3,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PATCH item desconhecido → 404', async () => {
    const res = await api.patch(`/checklist-templates/${templateId}/items/${GHOST_ID}`, {
      dueDay: 3,
    });
    expect(res.status).toBe(404);
  });

  it('DELETE remove o item; de novo → 404', async () => {
    const res = await api.delete(`/checklist-templates/${templateId}/items/${defaultItemId}`);
    expect(res.status).toBe(204);

    const again = await api.delete(`/checklist-templates/${templateId}/items/${defaultItemId}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_FOUND');
  });

  it('itens de template GLOBAL são imutáveis (add/patch/delete → 409 TEMPLATE_IMMUTABLE)', async () => {
    for (const res of await Promise.all([
      api.post(`/checklist-templates/${MEI_TEMPLATE_ID}/items`, { documentTypeId: docs[4] }),
      api.patch(`/checklist-templates/${MEI_TEMPLATE_ID}/items/${GHOST_ID}`, { dueDay: 1 }),
      api.delete(`/checklist-templates/${MEI_TEMPLATE_ID}/items/${GHOST_ID}`),
    ])) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TEMPLATE_IMMUTABLE');
    }
  });
});

describe('checklist efetivo da empresa', () => {
  let api: Api;
  let companyId: string;
  let templateId: string;
  let monthlyType: DocumentTypeRow;
  let presentFlagType: DocumentTypeRow;
  let absentFlagType: DocumentTypeRow;
  let annualType: DocumentTypeRow;
  let outsideType: DocumentTypeRow;

  const itemByType = (res: any, documentTypeId: string) =>
    res.body.data.items.find((item: any) => item.documentTypeId === documentTypeId);

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    [monthlyType, presentFlagType, absentFlagType, annualType, outsideType] =
      await documentTypeRows(api, 5);
    templateId = await createTemplate(api, [
      { documentTypeId: monthlyType.id, dueDay: 5 },
      { documentTypeId: presentFlagType.id, conditionFlag: 'has_employees' },
      { documentTypeId: absentFlagType.id, conditionFlag: 'accepts_card_payments' },
      {
        documentTypeId: annualType.id,
        periodicity: 'annual',
        annualMonth: 12,
        dueDay: 5,
        dueMonthOffset: 2,
      },
    ]);
    ({ id: companyId } = await createCompany(api, {
      name: 'Efetiva',
      checklistTemplateId: templateId,
      flags: { has_employees: true },
    }));
  });

  it('sem overrides: itens do template com applies calculado pelos flags', async () => {
    const res = await api.get(`/companies/${companyId}/checklist`);
    expect(res.status).toBe(200);
    expect(res.body.data.companyId).toBe(companyId);
    expect(res.body.data.template).toEqual({ id: templateId, name: expect.any(String) });
    expect(res.body.data.flags).toEqual({ has_employees: true });
    expect(res.body.data.items).toHaveLength(4);
    expect(res.body.data.items.every((item: any) => item.source === 'template')).toBe(true);

    expect(itemByType(res, monthlyType.id)).toMatchObject({
      name: monthlyType.name,
      category: monthlyType.category,
      periodicity: 'monthly',
      dueDay: 5,
      dueMonthOffset: 1,
      required: true,
      conditionFlag: null,
      applies: true,
    });
    expect(itemByType(res, presentFlagType.id).applies).toBe(true);
    expect(itemByType(res, absentFlagType.id).applies).toBe(false);
    expect(itemByType(res, annualType.id).applies).toBe(true);
  });

  it('override remove tira o item do checklist', async () => {
    const put = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: monthlyType.id,
      action: 'remove',
    });
    expect(put.status).toBe(200);

    const res = await api.get(`/companies/${companyId}/checklist`);
    expect(res.body.data.items).toHaveLength(3);
    expect(itemByType(res, monthlyType.id)).toBeUndefined();
  });

  it('override add inclui tipo fora do template com os defaults do contrato', async () => {
    const put = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: outsideType.id,
      action: 'add',
    });
    expect(put.status).toBe(200);

    const res = await api.get(`/companies/${companyId}/checklist`);
    expect(itemByType(res, outsideType.id)).toMatchObject({
      source: 'override',
      name: outsideType.name,
      periodicity: 'monthly',
      annualMonth: null,
      dueDay: null,
      dueMonthOffset: 1,
      conditionFlag: null,
      required: true,
      applies: true,
    });
  });

  /* `add` sobre tipo que JÁ está no template substitui a linha dele, e o que o override não
   * preencher HERDA do template — não do default global. O Contador mudou só o dia de
   * vencimento; a periodicidade anual e o offset do template continuam valendo. */
  it('add parcial sobre item anual herda o que não foi preenchido', async () => {
    const put = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: annualType.id,
      action: 'add',
      dueDay: 10,
    });
    expect(put.status).toBe(200);

    const res = await api.get(`/companies/${companyId}/checklist`);
    expect(itemByType(res, annualType.id)).toMatchObject({
      source: 'override',
      // do override
      dueDay: 10,
      // herdados do item ANUAL do template
      periodicity: 'annual',
      annualMonth: 12,
      dueMonthOffset: 2,
      required: true,
    });
  });

  it('GET checklist-overrides lista as linhas gravadas (remove com agenda zerada)', async () => {
    const res = await api.get(`/companies/${companyId}/checklist-overrides`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);

    const byType = Object.fromEntries(res.body.data.map((row: any) => [row.documentTypeId, row]));
    expect(byType[monthlyType.id]).toMatchObject({
      action: 'remove',
      name: monthlyType.name,
      category: monthlyType.category,
      periodicity: null,
      annualMonth: null,
      dueDay: null,
      dueMonthOffset: null,
      conditionFlag: null,
      required: null,
    });
    /* NULL na linha é o que significa "herda": preencher aqui era justamente o que derrotava
     * a herança. Tipo fora do template cai no default global na hora de montar o efetivo. */
    expect(byType[outsideType.id]).toMatchObject({ action: 'add', periodicity: null });
    expect(byType[annualType.id]).toMatchObject({ action: 'add', dueDay: 10 });
  });

  it('DELETE do override devolve a linha do template', async () => {
    const res = await api.delete(`/companies/${companyId}/checklist-overrides/${monthlyType.id}`);
    expect(res.status).toBe(204);

    const checklist = await api.get(`/companies/${companyId}/checklist`);
    expect(checklist.body.data.items).toHaveLength(5);
    expect(itemByType(checklist, monthlyType.id)).toMatchObject({ source: 'template', dueDay: 5 });
  });

  it('DELETE de override inexistente → 404; documentTypeId mal formado → 422', async () => {
    const ghost = await api.delete(`/companies/${companyId}/checklist-overrides/${GHOST_ID}`);
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe('NOT_FOUND');

    const malformed = await api.delete(`/companies/${companyId}/checklist-overrides/nao-e-uuid`);
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('overrides — upsert e validação', () => {
  let api: Api;
  let companyId: string;
  let bareCompanyId: string;
  let docs: string[];

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    docs = await documentTypeIds(api, 3);
    const templateId = await createTemplate(api, [{ documentTypeId: docs[0] }]);
    ({ id: companyId } = await createCompany(api, {
      name: 'Com Template',
      checklistTemplateId: templateId,
    }));
    ({ id: bareCompanyId } = await createCompany(api, { name: 'Sem Template' }));
  });

  it('PUT responde 200 e o upsert atualiza a mesma linha', async () => {
    const first = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: docs[1],
      action: 'add',
      dueDay: 7,
    });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      companyId,
      documentTypeId: docs[1],
      action: 'add',
      dueDay: 7,
      // nulo = herda; só o que o Contador enviou fica gravado
      periodicity: null,
      dueMonthOffset: null,
      required: null,
    });

    const second = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: docs[1],
      action: 'add',
      dueDay: 9,
      required: false,
    });
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data).toMatchObject({ dueDay: 9, required: false });

    const stored = await db
      .select({ id: companyChecklistOverride.id })
      .from(companyChecklistOverride)
      .where(
        and(
          eq(companyChecklistOverride.companyId, companyId),
          eq(companyChecklistOverride.documentTypeId, docs[1]),
        ),
      );
    expect(stored).toHaveLength(1);
  });

  it('remove zera os campos de agenda mesmo que o corpo os traga', async () => {
    const res = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: docs[0],
      action: 'remove',
      dueDay: 10,
      required: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      action: 'remove',
      periodicity: null,
      annualMonth: null,
      dueDay: null,
      dueMonthOffset: null,
      conditionFlag: null,
      required: null,
    });
  });

  it('remove de tipo fora do template → 422 OVERRIDE_REMOVES_NOTHING', async () => {
    const res = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: docs[2],
      action: 'remove',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OVERRIDE_REMOVES_NOTHING');
  });

  it('tipo de documento invisível → 422 DOCUMENT_TYPE_NOT_VISIBLE', async () => {
    const res = await api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: GHOST_ID,
      action: 'add',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DOCUMENT_TYPE_NOT_VISIBLE');
  });

  it('corpo inválido → 422 VALIDATION_ERROR', async () => {
    for (const body of [
      { documentTypeId: docs[1], action: 'replace' },
      { documentTypeId: docs[1], action: 'add', periodicity: 'annual' },
      { documentTypeId: docs[1], action: 'add', conditionFlag: 'tem_gato' },
    ]) {
      const res = await api.put(`/companies/${companyId}/checklist-overrides`, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('empresa sem template: checklist nasce dos overrides; remove não enxerga nem o próprio add', async () => {
    const add = await api.put(`/companies/${bareCompanyId}/checklist-overrides`, {
      documentTypeId: docs[1],
      action: 'add',
    });
    expect(add.status).toBe(200);

    const checklist = await api.get(`/companies/${bareCompanyId}/checklist`);
    expect(checklist.status).toBe(200);
    expect(checklist.body.data.template).toBeNull();
    expect(checklist.body.data.items).toHaveLength(1);
    expect(checklist.body.data.items[0]).toMatchObject({
      documentTypeId: docs[1],
      source: 'override',
    });

    /* O guard de remove olha só os itens do template, não os adds já gravados. */
    const remove = await api.put(`/companies/${bareCompanyId}/checklist-overrides`, {
      documentTypeId: docs[1],
      action: 'remove',
    });
    expect(remove.status).toBe(422);
    expect(remove.body.error.code).toBe('OVERRIDE_REMOVES_NOTHING');
  });

  it('empresa desconhecida → 404 em todas as rotas; companyId mal formado → 422', async () => {
    for (const res of await Promise.all([
      api.get(`/companies/${GHOST_ID}/checklist`),
      api.get(`/companies/${GHOST_ID}/checklist-overrides`),
      api.put(`/companies/${GHOST_ID}/checklist-overrides`, {
        documentTypeId: docs[1],
        action: 'add',
      }),
      api.delete(`/companies/${GHOST_ID}/checklist-overrides/${docs[1]}`),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }

    const malformed = await api.get('/companies/nao-e-uuid/checklist');
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('isolamento entre firmas', () => {
  it('template, itens e overrides de uma firma são invisíveis e intocáveis para outra', async () => {
    const [a, b] = await Promise.all([registerFirm(app.url), registerFirm(app.url)]);

    const [docId] = await documentTypeIds(a.api, 1);
    const templateId = await createTemplate(a.api, [{ documentTypeId: docId }]);
    const detail = await a.api.get(`/checklist-templates/${templateId}`);
    const itemId: string = detail.body.data.items[0].id;
    const { id: companyId } = await createCompany(a.api, {
      name: 'Da Firma A',
      checklistTemplateId: templateId,
    });
    const put = await a.api.put(`/companies/${companyId}/checklist-overrides`, {
      documentTypeId: docId,
      action: 'remove',
    });
    expect(put.status).toBe(200);

    const list = await b.api.get('/checklist-templates');
    expect(list.body.data.some((row: any) => row.id === templateId)).toBe(false);
    expect(list.body.data).toHaveLength(5);

    for (const res of await Promise.all([
      b.api.get(`/checklist-templates/${templateId}`),
      b.api.patch(`/checklist-templates/${templateId}`, { name: 'Roubado' }),
      b.api.delete(`/checklist-templates/${templateId}`),
      b.api.post(`/checklist-templates/${templateId}/derive`, {}),
      b.api.post(`/checklist-templates/${templateId}/items`, { documentTypeId: docId }),
      b.api.patch(`/checklist-templates/${templateId}/items/${itemId}`, { dueDay: 1 }),
      b.api.delete(`/checklist-templates/${templateId}/items/${itemId}`),
      b.api.get(`/companies/${companyId}/checklist`),
      b.api.get(`/companies/${companyId}/checklist-overrides`),
      b.api.put(`/companies/${companyId}/checklist-overrides`, {
        documentTypeId: docId,
        action: 'add',
      }),
      b.api.delete(`/companies/${companyId}/checklist-overrides/${docId}`),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });
});

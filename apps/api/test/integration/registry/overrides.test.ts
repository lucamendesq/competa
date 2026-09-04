import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { companyChecklistOverride } from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, productTemplate } from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** Override + checklist efetivo: template − removidos + adicionados, com `applies`
 *  resolvido contra as flags da Empresa. Ponto único de verdade do fan-out. */

let app: INestApplication;
const FANTASMA = '01a06884-0000-7000-8000-0000000000ff';
const NO_TEMPLATE_MEI = CATALOG.extrato_bancario.id;
const FORA_DO_TEMPLATE_MEI = CATALOG.guia_iss.id;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  clearRateLimit(app);
});

const setup = async (flags: Record<string, boolean> = {}) => {
  const session = await createAccountantSession(app);
  const company = await createCompany(app, session.cookie, { name: 'Padaria', flags });

  return { session, company };
};

const checklist = async (cookie: string, companyId: string) => {
  const response = await http(app)
    .get(`/companies/${companyId}/checklist`)
    .set('cookie', cookie)
    .expect(200);

  return response.body.data as {
    template: { id: string; name: string };
    flags: Record<string, boolean>;
    items: {
      documentTypeId: string;
      source: string;
      applies: boolean;
      required: boolean;
      periodicity: string;
    }[];
  };
};

test('Empresa sem override devolve o template puro, toda linha marcada como template', async () => {
  const { session, company } = await setup();
  const template = await productTemplate();

  const efetivo = await checklist(session.cookie, company.id);

  expect(efetivo.template).toEqual({ id: template.id, name: template.name });
  expect(efetivo.items).toHaveLength(10);
  expect(efetivo.items.every((i) => i.source === 'template')).toBe(true);
});

test('applies resolve condition_flag contra as flags da Empresa', async () => {
  const semFlags = await setup();
  const efetivoSem = await checklist(semFlags.session.cookie, semFlags.company.id);
  const folhaSem = efetivoSem.items.find((i) => i.documentTypeId === CATALOG.variaveis_folha.id);
  const cartaoSem = efetivoSem.items.find((i) => i.documentTypeId === CATALOG.relatorio_cartao.id);
  const extratoSem = efetivoSem.items.find((i) => i.documentTypeId === NO_TEMPLATE_MEI);

  expect(folhaSem?.applies).toBe(false);
  expect(cartaoSem?.applies).toBe(false);
  expect(extratoSem?.applies).toBe(true);

  clearRateLimit(app);
  const comFlags = await setup({ has_employees: true });
  const efetivoCom = await checklist(comFlags.session.cookie, comFlags.company.id);
  const folhaCom = efetivoCom.items.find((i) => i.documentTypeId === CATALOG.variaveis_folha.id);
  const cartaoCom = efetivoCom.items.find((i) => i.documentTypeId === CATALOG.relatorio_cartao.id);

  expect(folhaCom?.applies).toBe(true);
  expect(cartaoCom?.applies).toBe(false);
});

test('override add do MESMO Tipo de Documento substitui a linha do template — não duplica', async () => {
  const { session, company } = await setup();

  await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({
      documentTypeId: NO_TEMPLATE_MEI,
      action: 'add',
      periodicity: 'on_demand',
      required: false,
    })
    .expect(200);

  const efetivo = await checklist(session.cookie, company.id);
  const linhas = efetivo.items.filter((i) => i.documentTypeId === NO_TEMPLATE_MEI);

  expect(efetivo.items).toHaveLength(10);
  expect(linhas).toHaveLength(1);
  expect(linhas[0]).toMatchObject({
    source: 'override',
    periodicity: 'on_demand',
    required: false,
  });
});

test('override add de Tipo de Documento novo entra no checklist efetivo com os defaults', async () => {
  const { session, company } = await setup();

  await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: FORA_DO_TEMPLATE_MEI, action: 'add' })
    .expect(200);

  const efetivo = await checklist(session.cookie, company.id);
  const nova = efetivo.items.find((i) => i.documentTypeId === FORA_DO_TEMPLATE_MEI);

  expect(efetivo.items).toHaveLength(11);
  expect(nova).toMatchObject({
    source: 'override',
    periodicity: 'monthly',
    required: true,
    applies: true,
  });
});

test('override remove tira a linha do template do checklist efetivo', async () => {
  const { session, company } = await setup();

  await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: NO_TEMPLATE_MEI, action: 'remove' })
    .expect(200);

  const efetivo = await checklist(session.cookie, company.id);

  expect(efetivo.items).toHaveLength(9);
  expect(efetivo.items.some((i) => i.documentTypeId === NO_TEMPLATE_MEI)).toBe(false);
});

test('override remove de item que não está no template não muda o checklist, mas fica registrado', async () => {
  const { session, company } = await setup();

  await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: FORA_DO_TEMPLATE_MEI, action: 'remove' })
    .expect(200);

  const efetivo = await checklist(session.cookie, company.id);
  expect(efetivo.items).toHaveLength(10);

  const lista = await http(app)
    .get(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .expect(200);
  expect(lista.body.data).toMatchObject([
    { documentTypeId: FORA_DO_TEMPLATE_MEI, action: 'remove' },
  ]);
});

test('PUT duas vezes no mesmo Tipo de Documento é upsert: uma linha, o último valor vence', async () => {
  const { session, company } = await setup();
  const rota = `/companies/${company.id}/checklist-overrides`;

  await http(app)
    .put(rota)
    .set('cookie', session.cookie)
    .send({ documentTypeId: NO_TEMPLATE_MEI, action: 'add', dueDay: 5 })
    .expect(200);
  await http(app)
    .put(rota)
    .set('cookie', session.cookie)
    .send({ documentTypeId: NO_TEMPLATE_MEI, action: 'remove' })
    .expect(200);

  const rows = await db.select().from(companyChecklistOverride);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'remove', dueDay: null });
});

test('DELETE de override existente responde 204 e devolve o template puro; de inexistente, 404', async () => {
  const { session, company } = await setup();
  await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: NO_TEMPLATE_MEI, action: 'remove' })
    .expect(200);

  await http(app)
    .delete(`/companies/${company.id}/checklist-overrides/${NO_TEMPLATE_MEI}`)
    .set('cookie', session.cookie)
    .expect(204);

  const efetivo = await checklist(session.cookie, company.id);
  expect(efetivo.items).toHaveLength(10);
  expect(await db.select().from(companyChecklistOverride)).toHaveLength(0);

  await http(app)
    .delete(`/companies/${company.id}/checklist-overrides/${NO_TEMPLATE_MEI}`)
    .set('cookie', session.cookie)
    .expect(404);
});

test('override add anual sem annualMonth é recusado com 422', async () => {
  const { session, company } = await setup();

  const response = await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: FORA_DO_TEMPLATE_MEI, action: 'add', periodicity: 'annual' })
    .expect(422);

  expect(JSON.stringify(response.body.error.details)).toMatch(/annualMonth/);
  expect(await db.select().from(companyChecklistOverride)).toHaveLength(0);
});

test('override com Tipo de Documento inexistente é recusado com 422', async () => {
  const { session, company } = await setup();

  const response = await http(app)
    .put(`/companies/${company.id}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: FANTASMA, action: 'add' })
    .expect(422);

  expect(response.body.error.code).toBe('DOCUMENT_TYPE_NOT_VISIBLE');
});

test('checklist e overrides de Empresa inexistente respondem 404', async () => {
  const { session } = await setup();

  await http(app)
    .get(`/companies/${FANTASMA}/checklist`)
    .set('cookie', session.cookie)
    .expect(404);
  await http(app)
    .get(`/companies/${FANTASMA}/checklist-overrides`)
    .set('cookie', session.cookie)
    .expect(404);
  await http(app)
    .put(`/companies/${FANTASMA}/checklist-overrides`)
    .set('cookie', session.cookie)
    .send({ documentTypeId: NO_TEMPLATE_MEI, action: 'remove' })
    .expect(404);
});

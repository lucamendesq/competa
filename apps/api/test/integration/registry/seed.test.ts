import { count, eq, isNull } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import {
  checklistTemplate,
  checklistTemplateItem,
  documentType,
} from '../../../src/infra/database/schema/index.js';
import seedDocumentTypes, {
  CATALOG,
} from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { db, resetDatabase } from '../../db.js';
import { createFirm } from '../../factories.js';

/** O seed do produto roda em toda migração e em todo deploy. Se ele não for idempotente,
 *  o catálogo duplica e todo template do produto vira lixo. */

const EXPECTED_ITEMS: Record<string, number> = {
  'Template MEI': 10,
  'Template Simples — Serviços': 14,
  'Template Simples — Comércio': 18,
  'Template Lucro Presumido': 18,
  'Template Lucro Real': 18,
};

const total = async (table: typeof documentType | typeof checklistTemplate) => {
  const [row] = await db.select({ value: count() }).from(table);

  return row.value;
};

beforeEach(async () => {
  await resetDatabase();
});

test('rodar o seed de novo não duplica Tipo de Documento nem Template de Checklist', async () => {
  const typesBefore = await total(documentType);
  const templatesAntes = await total(checklistTemplate);
  const [itemsBefore] = await db.select({ value: count() }).from(checklistTemplateItem);

  await seedDocumentTypes();
  await seedDocumentTypes();

  expect(await total(documentType)).toBe(typesBefore);
  expect(await total(checklistTemplate)).toBe(templatesAntes);
  const [itemsAfter] = await db.select({ value: count() }).from(checklistTemplateItem);
  expect(itemsAfter.value).toBe(itemsBefore.value);
});

test('o seed entrega o catálogo inteiro e os 5 templates do produto', async () => {
  expect(await total(documentType)).toBe(Object.keys(CATALOG).length);

  const templates = await db
    .select()
    .from(checklistTemplate)
    .where(isNull(checklistTemplate.accountingFirmId));

  expect(templates).toHaveLength(5);
  expect(templates.every((t) => t.derivedFrom === null)).toBe(true);
});

test('cada template fixo do produto tem a contagem de itens esperada', async () => {
  const templates = await db.select().from(checklistTemplate);

  for (const template of templates) {
    const [{ value }] = await db
      .select({ value: count() })
      .from(checklistTemplateItem)
      .where(eq(checklistTemplateItem.checklistTemplateId, template.id));

    expect({ [template.name]: value }).toEqual({ [template.name]: EXPECTED_ITEMS[template.name] });
  }
});

test('rodar o seed de novo não toca no que a Contabilidade cadastrou', async () => {
  const firm = await createFirm();
  const [proprio] = await db
    .insert(documentType)
    .values({ accountingFirmId: firm.id, name: 'Doc próprio', category: 'fiscal' })
    .returning();
  const [derived] = await db
    .insert(checklistTemplate)
    .values({ accountingFirmId: firm.id, name: 'Template próprio' })
    .returning();

  await seedDocumentTypes();

  const [kind] = await db.select().from(documentType).where(eq(documentType.id, proprio.id));
  const [template] = await db
    .select()
    .from(checklistTemplate)
    .where(eq(checklistTemplate.id, derived.id));

  expect(kind.name).toBe('Doc próprio');
  expect(template.name).toBe('Template próprio');
  expect(await total(documentType)).toBe(Object.keys(CATALOG).length + 1);
});

test('todo Tipo de Documento do seed é do produto (accounting_firm_id nulo)', async () => {
  const rows = await db.select().from(documentType);

  expect(rows.every((row) => row.accountingFirmId === null)).toBe(true);
});

import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { documentType } from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession } from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** Catálogo: o dicionário do produto mais o que a Contabilidade acrescentou. */

const TOTAL_DO_PRODUTO = Object.keys(CATALOG).length;
const FISCAIS_DO_PRODUTO = Object.values(CATALOG).filter((e) => e.category === 'fiscal').length;

let app: INestApplication;

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

test('catálogo devolve o seed do produto marcado como isProduct', async () => {
  const session = await createAccountantSession(app);

  const response = await http(app)
    .get('/document-types?perPage=100')
    .set('cookie', session.cookie)
    .expect(200);

  expect(response.body.meta.total).toBe(TOTAL_DO_PRODUTO);
  expect(response.body.data).toHaveLength(TOTAL_DO_PRODUTO);
  expect(response.body.data.every((row: { isProduct: boolean }) => row.isProduct)).toBe(true);
});

test('filtro por categoria devolve só aquela categoria e o total daquela categoria', async () => {
  const session = await createAccountantSession(app);

  const response = await http(app)
    .get('/document-types?category=fiscal&perPage=100')
    .set('cookie', session.cookie)
    .expect(200);

  expect(response.body.meta.total).toBe(FISCAIS_DO_PRODUTO);
  expect(
    response.body.data.every((row: { category: string }) => row.category === 'fiscal'),
  ).toBe(true);
});

test('paginação do catálogo respeita perPage e mantém o total do filtro', async () => {
  const session = await createAccountantSession(app);

  const primeira = await http(app)
    .get('/document-types?page=1&perPage=3')
    .set('cookie', session.cookie)
    .expect(200);
  const segunda = await http(app)
    .get('/document-types?page=2&perPage=3')
    .set('cookie', session.cookie)
    .expect(200);

  expect(primeira.body.data).toHaveLength(3);
  expect(primeira.body.meta).toEqual({ page: 1, perPage: 3, total: TOTAL_DO_PRODUTO });
  expect(segunda.body.data).toHaveLength(3);
  const idsPrimeira = primeira.body.data.map((r: { id: string }) => r.id);
  expect(segunda.body.data.some((r: { id: string }) => idsPrimeira.includes(r.id))).toBe(false);
});

test('Tipo de Documento da própria Contabilidade entra no catálogo sem virar seed do produto', async () => {
  const session = await createAccountantSession(app);
  await db.insert(documentType).values({
    accountingFirmId: session.firm.id,
    name: 'AAA Planilha própria',
    category: 'corporate',
    acceptedFormats: ['xlsx'],
    description: 'Só desta Contabilidade',
  });

  const response = await http(app)
    .get('/document-types?category=corporate&perPage=100')
    .set('cookie', session.cookie)
    .expect(200);

  const proprio = response.body.data.find(
    (row: { name: string }) => row.name === 'AAA Planilha própria',
  );
  expect(proprio).toMatchObject({ isProduct: false, acceptedFormats: ['xlsx'] });
});

test('categoria fora do vocabulário do catálogo é recusada com 422', async () => {
  const session = await createAccountantSession(app);

  await http(app)
    .get('/document-types?category=inventada')
    .set('cookie', session.cookie)
    .expect(422);
});

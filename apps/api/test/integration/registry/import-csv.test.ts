import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { company, contact } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession } from '../../factories.js';
import { clearRateLimit } from './helpers.js';

/** Importação em lote: o Contador cola um CSV exportado do sistema antigo. Uma linha
 *  ruim não pode derrubar o lote, e o número de linha do relatório é o que ele vai
 *  procurar na planilha — tem que bater com o arquivo dele. */

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

const importar = async (csv: string) => {
  const session = await createAccountantSession(app);
  const response = await http(app)
    .post('/companies/import')
    .set('cookie', session.cookie)
    .send({ csv });

  return { session, status: response.status, body: response.body };
};

test('cabeçalho com acento, maiúscula e espaço é normalizado para os campos do CSV', async () => {
  const { body } = await importar(
    'Name , Template , Contáct Email , CNPJ\nPadaria Central,Template MEI,ana@padaria.com,11.222.333/0001-81\n',
  );

  expect(body.data).toMatchObject({ total: 1, created: 1, failed: 0 });
  const [row] = await db.select().from(company);
  expect(row.name).toBe('Padaria Central');
  expect(row.cnpj).toBe('11222333000181');
  const [resp] = await db.select().from(contact).where(eq(contact.companyId, row.id));
  expect(resp.email).toBe('ana@padaria.com');
  expect(resp.name).toBe('Padaria Central');
});

test('CSV com ponto e vírgula é aceito sem o Contador declarar o delimitador', async () => {
  const { body } = await importar('name;template\nBar do Zé;Template MEI\n');

  expect(body.data).toMatchObject({ total: 1, created: 1, failed: 0 });
  expect((await db.select().from(company))[0].name).toBe('Bar do Zé');
});

test('campo entre aspas com vírgula e aspas escapadas sobrevive ao CRLF do Excel', async () => {
  const { body } = await importar(
    'name,template\r\n"Padaria, do ""João""",Template MEI\r\n"Outra, Ltda",Template MEI\r\n',
  );

  expect(body.data).toMatchObject({ total: 2, created: 2, failed: 0 });
  const nomes = (await db.select().from(company)).map((row) => row.name).sort();
  expect(nomes).toEqual(['Outra, Ltda', 'Padaria, do "João"']);
});

test('linha em branco no meio não desalinha o número de linha do relatório', async () => {
  const { body } = await importar(
    'name,template\nAlfa,Template MEI\n\nBeta,Template Inexistente\n',
  );

  expect(body.data.total).toBe(2);
  expect(body.data.lines.map((l: { line: number }) => l.line)).toEqual([2, 4]);
  expect(body.data.lines[1]).toMatchObject({ line: 4, status: 'error', name: 'Beta' });
});

test('linha com template inexistente, email inválido ou nome vazio falha sozinha e o lote continua', async () => {
  const { body } = await importar(
    [
      'name,template,contact email',
      'Boa,Template MEI,ok@boa.com',
      'Sem Template,Template Que Não Existe,ok@sem.com',
      'Email Torto,Template MEI,arroba-nada',
      ',Template MEI,ok@vazia.com',
    ].join('\n'),
  );

  expect(body.data).toMatchObject({ total: 4, created: 1, failed: 3 });
  const [boa, semTemplate, emailTorto, semNome] = body.data.lines;
  expect(boa).toMatchObject({ line: 2, status: 'created', name: 'Boa' });
  expect(semTemplate.error).toMatch(/Template "Template Que Não Existe" não encontrado/);
  expect(emailTorto.error).toMatch(/contact.email/);
  expect(semNome.error).toMatch(/name/);

  const gravadas = await db.select().from(company);
  expect(gravadas.map((row) => row.name)).toEqual(['Boa']);
});

test('flags vêm por nome separadas por | e as desconhecidas são ignoradas', async () => {
  const { body } = await importar(
    'name,template,flags\nCom Flags,Template MEI,has_employees|has_inventory|voa_de_jato\n',
  );

  expect(body.data.created).toBe(1);
  expect((await db.select().from(company))[0].flags).toEqual({
    has_employees: true,
    has_inventory: true,
  });
});

test('CSV só com cabeçalho não cria nada e devolve total zero', async () => {
  const { body } = await importar('name,template,contact email\n');

  expect(body.data).toMatchObject({ total: 0, created: 0, failed: 0, lines: [] });
  expect(await db.select().from(company)).toHaveLength(0);
});

test('CSV vazio é recusado com 422 — não é importação de zero linhas, é pedido inválido', async () => {
  const { status, body } = await importar('');

  expect(status).toBe(422);
  expect(body.error.code).toBe('VALIDATION_ERROR');
});

test('importação grava as Empresas na Contabilidade de quem importou', async () => {
  const { session } = await importar('name,template\nMinha,Template MEI\n');

  const rows = await db.select().from(company);
  expect(rows[0].accountingFirmId).toBe(session.firm.id);
});

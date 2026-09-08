import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { cookieHeader, createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, productTemplate } from '../../factories.js';
import { contact, invite } from '../../../src/infra/database/schema/index.js';
import { MessageProvider } from '../../../src/modules/messaging/providers/message.provider.js';

/** "Convidar para o app" (D14): ação avulsa do Contador que QUER empurrar a conta, nunca
 *  etapa do fluxo. Cadastrar Empresa não escreve para o Responsável — o primeiro email que
 *  ele recebe é o Link de Upload, na abertura da Competência. */

let app: INestApplication;
const sent: { recipient: string; subject: string; body: string; senderName?: string }[] = [];

beforeAll(async () => {
  app = await createTestApp();

  /* Espiona a borda do canal: o que interessa é O QUE sai, não como. */
  const provider = app.get(MessageProvider);
  vi.spyOn(provider, 'send').mockImplementation(async (message) => {
    sent.push(message);
  });
});

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
});

const registerCompany = async (cookie: string, name: string, email?: string) => {
  const template = await productTemplate();

  const response = await http(app)
    .post('/companies')
    .set('cookie', cookie)
    .send({
      name,
      checklistTemplateId: template.id,
      ...(email ? { contact: { name: 'Responsável Teste', email } } : {}),
    })
    .expect(201);

  return response.body.data;
};

const inviteToApp = async (cookie: string, companyIds: string[]) =>
  http(app)
    .post('/companies/access-invites')
    .set('cookie', cookie)
    .send({ companyIds })
    .expect(201);

test('cadastrar Empresa NÃO escreve para o Responsável', async () => {
  const session = await createAccountantSession(app, { firmName: 'Contabilidade Alfa' });

  await registerCompany(session.cookie, 'Padaria Central', 'maria@padaria.com.br');

  expect(sent).toHaveLength(0);
});

test('adicionar Responsável a uma Empresa também não escreve para ele', async () => {
  const session = await createAccountantSession(app);
  const company = await registerCompany(session.cookie, 'Mercado Um');

  await http(app)
    .post(`/companies/${company.id}/contacts`)
    .set('cookie', session.cookie)
    .send({ name: 'Ana Lima', email: 'ana@mercado.com.br' })
    .expect(201);

  expect(sent).toHaveLength(0);
});

test('importar planilha não manda email; "Convidar para o app" manda, uma vez só', async () => {
  const session = await createAccountantSession(app);
  const template = await productTemplate();

  const csv = [
    'name,template,contact_name,contact_email',
    `Mercado Aurora,${template.name},Ana Lima,ana@aurora.com.br`,
    `Oficina Bom Freio,${template.name},Rui Alves,rui@bomfreio.com.br`,
  ].join('\n');

  const imported = await http(app)
    .post('/companies/import')
    .set('cookie', session.cookie)
    .send({ csv })
    .expect(201);

  expect(imported.body.data.created).toBe(2);
  expect(sent).toHaveLength(0);

  const companyIds = imported.body.data.lines
    .filter((line: { status: string }) => line.status === 'created')
    .map((line: { companyId: string }) => line.companyId);

  const invited = await inviteToApp(session.cookie, companyIds);

  expect(invited.body.data.invited).toBe(2);
  expect(sent).toHaveLength(2);

  // segunda chamada não repete: já existe convite pendente
  const again = await inviteToApp(session.cookie, companyIds);

  expect(again.body.data.invited).toBe(0);
  expect(again.body.data.skipped).toBe(2);
  expect(sent).toHaveLength(2);
});

test('o convite vende conta, não cobrança: nenhum documento é pedido nele', async () => {
  const session = await createAccountantSession(app, { firmName: 'Contabilidade Alfa' });
  const company = await registerCompany(session.cookie, 'Bar do Tião', 'tiao@bar.com.br');

  await inviteToApp(session.cookie, [company.id]);

  const [email] = sent;
  expect(email.recipient).toBe('tiao@bar.com.br');
  // o Responsável tem de reconhecer de quem é
  expect(email.senderName).toBe('Contabilidade Alfa');
  expect(email.body).toContain('/convite/');
  expect(email.body).not.toContain('/envio/');
  // e tem de ficar claro que não é obrigatório
  expect(email.body).toMatch(/não é obrigatório/);
});

test('o aceite define a senha, e o convite não serve para o signup de Contador', async () => {
  const session = await createAccountantSession(app);
  const company = await registerCompany(session.cookie, 'Bar do Tião', 'tiao@bar.com.br');
  await inviteToApp(session.cookie, [company.id]);

  const token = sent[0].body.match(/\/convite\/([A-Za-z0-9_-]+)/)![1];

  const preview = await http(app).get(`/invites/${token}`).expect(200);
  expect(preview.body.data).toMatchObject({
    email: 'tiao@bar.com.br',
    companyName: 'Bar do Tião',
    target: 'company',
  });

  await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Tião', email: 'tiao@bar.com.br', password: 'senha-forte-123' })
    .expect(422);

  /* `{ name: '' }` é o que um formulário manda quando o campo opcional fica em branco:
   * tem de passar, senão a rota recusa o caminho normal da tela. */
  await http(app)
    .post(`/invites/${token}/contact-account`)
    .send({ name: '', password: 'senha-forte-123' })
    .expect(201);

  const signIn = await http(app)
    .post('/api/auth/sign-in/email')
    .send({ email: 'tiao@bar.com.br', password: 'senha-forte-123' })
    .expect(200);

  await http(app)
    .get('/my/profile')
    .set('cookie', cookieHeader(signIn.headers['set-cookie']))
    .expect(200);

  const [row] = await db
    .select({ authUserId: contact.authUserId })
    .from(contact)
    .where(eq(contact.companyId, company.id));
  expect(row.authUserId).not.toBeNull();

  const [accepted_] = await db.select().from(invite).where(eq(invite.email, 'tiao@bar.com.br'));
  expect(accepted_.acceptedAt).not.toBeNull();

  await http(app)
    .post(`/invites/${token}/contact-account`)
    .send({ password: 'senha-forte-123' })
    .expect(409);
});

/** D14 reverte a trava da D13: a conta do Responsável NUNCA é pré-requisito de cobrar. */
test('a Competência cobra toda Empresa ativa com email de Responsável, tenha conta ou não', async () => {
  const session = await createAccountantSession(app);

  await registerCompany(session.cookie, 'Com email A', 'a@teste.com');
  await registerCompany(session.cookie, 'Com email B', 'b@teste.com');
  await registerCompany(session.cookie, 'Sem Responsável');

  const opened = await http(app)
    .post('/periods')
    .set('cookie', session.cookie)
    .send({ referenceMonth: '2026-07' })
    .expect(201);

  expect(
    opened.body.data.requests.map((row: { companyName: string }) => row.companyName).sort(),
  ).toEqual(['Com email A', 'Com email B']);

  expect(
    opened.body.data.warnings.map((row: { companyName: string; blockedBy: string }) => [
      row.companyName,
      row.blockedBy,
    ]),
  ).toEqual([['Sem Responsável', 'contact']]);
});

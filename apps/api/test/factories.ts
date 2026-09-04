import './env.js';

import { addDays } from 'date-fns';
import { eq } from 'drizzle-orm';
import type { INestApplication } from '@nestjs/common';
import { db } from '../src/infra/database/index.js';
import {
  accountingFirm,
  checklistTemplate,
  company,
  contact,
  invite,
} from '../src/infra/database/schema/index.js';
import { createToken } from '../src/lib/token.js';
import { cookieHeader, http } from './app.js';

/** Fixtures do domínio. Tudo passa pelas rotas reais quando existe rota; só o que não tem
 *  rota (provisionamento da Contabilidade, que é script) entra direto pelo banco. */

export const createFirm = async (name = 'Contabilidade Teste') => {
  const [firm] = await db.insert(accountingFirm).values({ name }).returning();

  return firm;
};

/** Contabilidade + Contador com sessão ativa. Devolve o header de cookie pronto. */
export const createAccountantSession = async (
  app: INestApplication,
  options: { firmName?: string; email?: string; password?: string } = {},
) => {
  const email = options.email ?? `contador-${Date.now()}-${Math.round(performance.now())}@teste.com`;
  const password = options.password ?? 'senha-forte-123';
  const firm = await createFirm(options.firmName);
  const { token, tokenHash } = createToken();

  await db.insert(invite).values({
    email,
    tokenHash,
    accountingFirmId: firm.id,
    expiresAt: addDays(new Date(), 7),
  });

  await http(app)
    .post('/auth/sign-up')
    .query({ token })
    .send({ name: 'Contador Teste', email, password })
    .expect(201);

  const signIn = await http(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .expect(200);

  return { firm, email, password, cookie: cookieHeader(signIn.headers['set-cookie']) };
};

/** Template fixo do produto (MEI) — o seed do catálogo garante que existe. */
export const productTemplate = async (name = 'Template MEI') => {
  const [template] = await db
    .select()
    .from(checklistTemplate)
    .where(eq(checklistTemplate.name, name))
    .limit(1);

  if (!template) throw new Error(`Template "${name}" não existe: o seed do produto rodou?`);

  return template;
};

export const createCompany = async (
  app: INestApplication,
  cookie: string,
  overrides: Record<string, unknown> = {},
) => {
  const template = await productTemplate();
  const body = {
    name: 'Empresa Teste',
    checklistTemplateId: template.id,
    contact: { name: 'Responsável Teste', email: `resp-${Date.now()}@teste.com` },
    ...overrides,
  };

  const response = await http(app)
    .post('/companies')
    .set('cookie', cookie)
    .send(body)
    .expect(201);

  return response.body.data as { id: string; name: string; contacts: { id: string }[] };
};

/** Empresa direto no banco quando o teste precisa de um estado que a rota não cria
 *  (Empresa inativa, Empresa sem Responsável). */
export const insertCompany = async (
  firmId: string,
  overrides: Partial<typeof company.$inferInsert> = {},
) => {
  const template = await productTemplate();
  const [row] = await db
    .insert(company)
    .values({
      accountingFirmId: firmId,
      checklistTemplateId: template.id,
      name: 'Empresa Direta',
      ...overrides,
    })
    .returning();

  return row;
};

export const insertContact = async (
  companyId: string,
  overrides: Partial<typeof contact.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(contact)
    .values({
      companyId,
      name: 'Responsável Direto',
      email: `resp-direto-${Date.now()}@teste.com`,
      ...overrides,
    })
    .returning();

  return row;
};

/** Abre a Competência pela rota real e devolve os tokens em claro dos Links de Upload. */
export const openPeriod = async (
  app: INestApplication,
  cookie: string,
  body: { referenceMonth: string; dueDate?: string },
) => {
  const response = await http(app).post('/periods').set('cookie', cookie).send(body).expect(201);
  const data = response.body.data as {
    id: string;
    referenceMonth: string;
    warnings: { companyName: string }[];
    requests: { id: string; companyName: string; itemCount: number; uploadUrl: string }[];
  };

  return {
    ...data,
    tokenFor: (companyName: string) => {
      const found = data.requests.find((row) => row.companyName === companyName);
      if (!found) throw new Error(`Sem Solicitação para "${companyName}"`);

      return found.uploadUrl.split('/').pop()!;
    },
  };
};

/** Sobe um arquivo pelo fluxo público real: presign → PUT → confirm. */
export const uploadFile = async (
  app: INestApplication,
  token: string,
  file: { fileName: string; contentType?: string; content?: string; requestItemId?: string | null },
) => {
  const content = file.content ?? '%PDF conteudo de teste';
  const body = {
    ...(file.requestItemId ? { requestItemId: file.requestItemId } : {}),
    files: [
      {
        fileName: file.fileName,
        contentType: file.contentType ?? 'application/pdf',
        sizeBytes: Buffer.byteLength(content),
      },
    ],
  };

  const presign = await http(app).post(`/upload/${token}/documents`).send(body).expect(201);
  const [entry] = presign.body.data.files as {
    accepted: boolean;
    reason?: string;
    documentId?: string;
    uploadUrl?: string;
  }[];

  if (!entry.accepted) return { accepted: false as const, reason: entry.reason! };

  const path = new URL(entry.uploadUrl!).pathname + new URL(entry.uploadUrl!).search;
  await http(app).put(path).set('content-type', 'application/pdf').send(Buffer.from(content));

  const confirm = await http(app)
    .post(`/upload/${token}/documents/confirm`)
    .send({ documentIds: [entry.documentId] })
    .expect(201);

  return {
    accepted: true as const,
    documentId: entry.documentId!,
    confirm: confirm.body.data as { confirmed: number; submittedItemIds: string[]; refused: [] },
  };
};

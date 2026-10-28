import { desc, like } from 'drizzle-orm';
import { expect } from 'vitest';
import { verification } from '../../src/infra/database/schema/index.js';
import { db } from './db.js';

export type ApiResponse = { status: number; body: any; headers: Headers };

export type Api = ReturnType<typeof apiClient>;

let ipSeq = 0;
/** Um balde de throttle por fixture: o app em teste roda com trust proxy, como em produção. */
export const uniqueIp = () => `10.77.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

export const apiClient = (baseUrl: string, opts: { cookie?: string; ip?: string } = {}) => {
  const ip = opts.ip ?? uniqueIp();
  const req = async (method: string, path: string, body?: unknown): Promise<ApiResponse> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'x-forwarded-for': ip,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  };

  return {
    get: (path: string) => req('GET', path),
    post: (path: string, body?: unknown) => req('POST', path, body),
    patch: (path: string, body?: unknown) => req('PATCH', path, body),
    put: (path: string, body?: unknown) => req('PUT', path, body),
    delete: (path: string) => req('DELETE', path),
  };
};

let seq = 0;

const cnpjCheckDigit = (slice: string) => {
  let weight = slice.length - 7;
  let sum = 0;
  for (const digit of slice) {
    sum += Number(digit) * weight;
    weight = weight - 1 < 2 ? 9 : weight - 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
};

let cnpjSeq = 0;
/** CNPJ válido (módulo 11) e único por processo: o banco recusa dois cadastros com o mesmo. */
export const uniqueCnpj = () => {
  const base = `${Date.now() % 100_000_000}`.padStart(8, '0') + `${++cnpjSeq}`.padStart(4, '0');
  const first = cnpjCheckDigit(base);
  return `${base}${first}${cnpjCheckDigit(`${base}${first}`)}`;
};

export async function registerFirm(baseUrl: string, firmName = `Contabilidade ${++seq}`) {
  const ip = uniqueIp();
  const email = `tester-${Date.now().toString(36)}-${seq}@example.com`;
  const res = await apiClient(baseUrl, { ip }).post('/auth/register', {
    firmName,
    userName: 'Tester',
    email,
    password: 'senha-forte-123',
    cnpj: uniqueCnpj(),
  });
  expect(res.status, 'registro de firma deve funcionar').toBe(201);

  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(cookie, 'registro deve devolver cookie de sessão').not.toBe('');

  return {
    api: apiClient(baseUrl, { cookie, ip }),
    cookie,
    email,
    firmName,
    userId: res.body.data.userId as string,
  };
}

export async function documentTypeIds(api: Api, count: number): Promise<string[]> {
  const res = await api.get('/document-types');
  expect(res.status).toBe(200);
  const rows: Array<{ id: string }> = res.body.data;
  expect(rows.length).toBeGreaterThanOrEqual(count);

  return rows.slice(0, count).map((row) => row.id);
}

export async function createTemplate(
  api: Api,
  items: Array<{ documentTypeId: string } & Record<string, unknown>>,
  name = `Template ${++seq}`,
) {
  const created = await api.post('/checklist-templates', { name });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const templateId: string = created.body.data.id;

  for (const item of items) {
    const added = await api.post(`/checklist-templates/${templateId}/items`, item);
    expect(added.status, JSON.stringify(added.body)).toBe(201);
  }

  return templateId;
}

export async function createCompany(
  api: Api,
  body: Record<string, unknown>,
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await api.post('/companies', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);

  return res.body.data;
}

export const contactBody = (name = `Responsável ${++seq}`) => ({
  name,
  email: `contato-${Date.now().toString(36)}-${seq}@example.com`,
});

/** Sessão de Responsável pelo caminho real: ativar o Link NÃO dá senha nem sessão — ela só
 *  nasce quando o magic link entregue na caixa dele é consumido. Vive aqui porque a ativação
 *  é pré-requisito de suítes de módulos diferentes. */
export const magicLinkTokenFor = async (email: string) => {
  const rows = await db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(like(verification.value, `%${email}%`))
    .orderBy(desc(verification.createdAt));

  return rows[0]?.identifier;
};

export async function contactSessionByMagicLink(
  baseUrl: string,
  uploadToken: string,
  email: string,
) {
  const activated = await apiClient(baseUrl).post(`/upload/${uploadToken}/access`, {});
  expect(activated.status, JSON.stringify(activated.body)).toBe(201);

  const token = await magicLinkTokenFor(email);
  expect(token, `magic link para ${email}`).toBeDefined();

  const verify = await fetch(
    `${baseUrl}/api/auth/magic-link/verify?token=${token}&callbackURL=/entrou`,
    { redirect: 'manual', headers: { 'x-forwarded-for': uniqueIp() } },
  );
  expect(verify.status, await verify.clone().text()).toBe(302);

  const cookie = verify.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token');

  return { api: apiClient(baseUrl, { cookie }), cookie };
}

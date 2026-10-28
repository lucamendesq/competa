import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import {
  accountant,
  contact,
  invite,
  message,
  pushSubscription,
  uploadLink,
  user as userTable,
} from '../src/infra/database/schema/index.js';
import {
  apiClient,
  contactBody,
  createCompany,
  createTemplate,
  documentTypeIds,
  registerFirm,
  type Api,
} from './support/fixtures.js';

const GHOST = '018f0000-0000-7000-8000-00000000dead';

let cnpjSeed = 0;
/** CNPJ sintético com dígitos verificadores válidos (módulo 11, mesmo algoritmo do contrato). */
const validCnpj = () => {
  const base = `${String(++cnpjSeed).padStart(8, '0')}0001`;
  const digit = (slice: string) => {
    let weight = slice.length - 7;
    let sum = 0;
    for (const d of slice) {
      sum += Number(d) * weight;
      weight = weight - 1 < 2 ? 9 : weight - 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = digit(base);
  return `${base}${d1}${digit(base + d1)}`;
};

const accountantIdOf = async (authUserId: string) => {
  const [row] = await db
    .select({ id: accountant.id })
    .from(accountant)
    .where(eq(accountant.authUserId, authUserId))
    .limit(1);
  return row.id;
};

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

    for (const res of await Promise.all([
      anon.get('/companies'),
      anon.get('/companies/usage'),
      anon.post('/companies', { name: 'X' }),
      anon.post('/companies/access-invites', { companyIds: [GHOST] }),
      anon.post('/companies/apply-template', { companyIds: [GHOST], checklistTemplateId: GHOST }),
      anon.post('/companies/import', { csv: 'name\nX' }),
      anon.post('/companies/import/confirm', { pending: [{ line: 2, body: { name: 'X' } }] }),
      anon.post('/companies/activate', { companyIds: [GHOST] }),
      anon.get(`/companies/${GHOST}`),
      anon.patch(`/companies/${GHOST}`, { name: 'X' }),
      anon.delete(`/companies/${GHOST}`),
      anon.get(`/companies/${GHOST}/contacts`),
      anon.post(`/companies/${GHOST}/contacts`, contactBody()),
      anon.patch(`/companies/${GHOST}/contacts/${GHOST}`, { name: 'X' }),
      anon.delete(`/companies/${GHOST}/contacts/${GHOST}`),
      anon.get(`/companies/${GHOST}/contacts/access`),
      anon.delete(`/companies/${GHOST}/contacts/${GHOST}/access`),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('POST /companies — criação e validação', () => {
  let api: Api;
  let userId: string;

  beforeAll(async () => {
    ({ api, userId } = await registerFirm(app.url));
  });

  it('cria com CNPJ formatado normalizado para dígitos, flags e responsável', async () => {
    const res = await api.post('/companies', {
      name: 'Padaria Trigal',
      cnpj: '11.222.333/0001-81',
      flags: { has_employees: true },
      contact: { name: 'Paula', email: 'paula-criacao@example.com', phone: '(11) 98888-7777' },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Padaria Trigal',
      cnpj: '11222333000181',
      flags: { has_employees: true },
      active: true,
      checklistTemplateId: null,
      responsibleAccountantId: null,
    });
    expect(res.body.data.contacts).toHaveLength(1);
    expect(res.body.data.contacts[0]).toMatchObject({
      name: 'Paula',
      email: 'paula-criacao@example.com',
      phone: '11988887777',
    });
  });

  it('CNPJ duplicado na mesma firma → 422', async () => {
    const res = await api.post('/companies', { name: 'Clone', cnpj: '11222333000181' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Já existe uma empresa com este CNPJ.');
  });

  it('CNPJ com dígitos verificadores errados, curto ou repetido → 422', async () => {
    for (const [cnpj, fragment] of [
      ['11.222.333/0001-80', 'dígitos verificadores'],
      ['123', '14 dígitos'],
      ['00000000000000', 'CNPJ inválido'],
    ]) {
      const res = await api.post('/companies', { name: 'Inválida', cnpj });
      expect(res.status, cnpj).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details)).toContain(fragment);
    }
  });

  it('nome vazio → 422 com issues', async () => {
    const res = await api.post('/companies', { name: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('template inexistente ou de outra Contabilidade → 422', async () => {
    const res = await api.post('/companies', { name: 'Sem Template', checklistTemplateId: GHOST });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      'Template de checklist inexistente ou de outra Contabilidade.',
    );
  });

  it('responsável contador inexistente → 422; o da própria firma passa', async () => {
    const bad = await api.post('/companies', {
      name: 'Órfã',
      responsibleAccountantId: GHOST,
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.message).toBe(
      'Contador responsável inexistente ou de outra Contabilidade.',
    );

    const mine = await accountantIdOf(userId);
    const ok = await api.post('/companies', { name: 'Com Dono', responsibleAccountantId: mine });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.data.responsibleAccountantId).toBe(mine);

    const got = await api.get(`/companies/${ok.body.data.id}`);
    expect(got.body.data.responsibleAccountantName).toBe('Tester');
  });
});

describe('GET /companies — listagem, busca e filtros', () => {
  let api: Api;
  let alphaCnpj: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    alphaCnpj = validCnpj();
    await createCompany(api, { name: 'Alfa Pães', cnpj: alphaCnpj });
    await createCompany(api, { name: 'Beta Mercado', cnpj: validCnpj(), contact: contactBody() });
    const gama = await createCompany(api, { name: 'Gama Farma' });
    const off = await api.patch(`/companies/${gama.id}`, { active: false });
    expect(off.status).toBe(200);
  });

  it('pagina com meta, ordena por nome e traz contagens + responsáveis embutidos', async () => {
    const res = await api.get('/companies?page=1&perPage=2');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, perPage: 2, total: 3 });
    expect(res.body.data.map((row: any) => row.name)).toEqual(['Alfa Pães', 'Beta Mercado']);

    const beta = res.body.data[1];
    expect(beta).toMatchObject({ contactCount: 1, readyContactCount: 0, templateName: null });
    expect(beta.contacts).toHaveLength(1);
    expect(beta.contacts[0]).toMatchObject({ name: expect.any(String), email: expect.any(String) });

    const page2 = await api.get('/companies?page=2&perPage=2');
    expect(page2.body.data.map((row: any) => row.name)).toEqual(['Gama Farma']);
  });

  it('busca por fragmento de nome (case-insensitive)', async () => {
    const res = await api.get('/companies?search=beta');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('Beta Mercado');
  });

  it('busca por CNPJ ignora pontuação', async () => {
    const dotted = `${alphaCnpj.slice(0, 2)}.${alphaCnpj.slice(2, 5)}.${alphaCnpj.slice(5, 8)}`;
    const res = await api.get(`/companies?search=${encodeURIComponent(dotted)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((row: any) => row.name)).toEqual(['Alfa Pães']);
  });

  it('filtra por active', async () => {
    const inactive = await api.get('/companies?active=false');
    expect(inactive.body.meta.total).toBe(1);
    expect(inactive.body.data[0].name).toBe('Gama Farma');

    const active = await api.get('/companies?active=true');
    expect(active.body.meta.total).toBe(2);
  });

  it('query inválida → 422', async () => {
    for (const query of ['page=abc', 'perPage=0', 'active=talvez']) {
      const res = await api.get(`/companies?${query}`);
      expect(res.status, query).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('usage e teto do plano (trial: 15 ativas, folga até 18)', () => {
  let api: Api;
  let inactiveIds: string[];
  let activeIds: string[];

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  it('usage da firma recém-criada: trial 0/15, folga 18', async () => {
    const res = await api.get('/companies/usage');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      planName: 'trial',
      companiesActive: 0,
      companiesInactive: 0,
      companyCap: 15,
      softCap: 18,
      overCap: false,
      recommendedPlan: 'essencial',
    });
  });

  it('importar 20 ativa só até a folga (18) e deixa o resto inativo', async () => {
    const pending = Array.from({ length: 20 }, (_, i) => ({
      line: i + 2,
      body: { name: `Lote ${String(i + 1).padStart(2, '0')}` },
    }));
    const res = await api.post('/companies/import/confirm', { pending });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ total: 20, created: 20, activated: 18, failed: 0 });
    const lines: any[] = res.body.data.lines;
    expect(lines.every((row) => row.status === 'created')).toBe(true);
    expect(lines.slice(0, 18).every((row) => row.active)).toBe(true);
    expect(lines.slice(18).every((row) => !row.active)).toBe(true);

    inactiveIds = lines.slice(18).map((row) => row.companyId);
    activeIds = lines.slice(0, 18).map((row) => row.companyId);
  });

  it('usage reflete o excedente acima do cap', async () => {
    const res = await api.get('/companies/usage');
    expect(res.body.data).toMatchObject({
      companiesActive: 18,
      companiesInactive: 2,
      overCap: true,
      recommendedPlan: 'essencial',
    });
  });

  it('cadastro avulso na folga cheia → 422 com a mensagem do teto', async () => {
    const res = await api.post('/companies', { name: 'Furona' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('Seu plano permite 15 empresas ativas');
    expect(res.body.error.message).toContain('você já tem 18');
  });

  it('ativação em lote sem vaga: nada ativa e o motivo explica o teto', async () => {
    const res = await api.post('/companies/activate', { companyIds: inactiveIds });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      activated: 0,
      skipped: 2,
      companyCap: 15,
      softCap: 18,
      reason:
        '2 empresa(s) não entraram: seu plano cobre 15 ativas (com folga até 18) e você já tinha 18.',
    });
  });

  it('desativar libera uma vaga; a ativação em lote ocupa só ela', async () => {
    const off = await api.patch(`/companies/${activeIds[0]}`, { active: false });
    expect(off.status).toBe(200);
    expect(off.body.data.active).toBe(false);

    const res = await api.post('/companies/activate', { companyIds: inactiveIds });
    expect(res.body.data).toMatchObject({ activated: 1, skipped: 1 });
  });

  it('reativar por PATCH com a folga cheia → 422', async () => {
    const res = await api.patch(`/companies/${activeIds[0]}`, { active: true });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('Seu plano permite 15 empresas ativas');
  });

  it('activate com corpo inválido → 422', async () => {
    const res = await api.post('/companies/activate', { companyIds: [] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('teto do plano sob concorrência', () => {
  it('25 cadastros em paralelo param exatamente na folga (18)', async () => {
    const { api } = await registerFirm(app.url);
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => api.post('/companies', { name: `Paralela ${i}` })),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(18);
    expect(results.filter((res) => res.status === 422)).toHaveLength(7);
    const usage = await api.get('/companies/usage');
    expect(usage.body.data.companiesActive).toBe(18);
  });
});

describe('POST /companies/import — prévia do CSV (nada é gravado)', () => {
  let api: Api;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  it('cabeçalho em português + ponto-e-vírgula: valida linha a linha e aponta erros', async () => {
    const cnpj = validCnpj();
    const csv = [
      'Razão Social;CNPJ;Responsável;E-mail do responsável;Telefone;Tem funcionários',
      `Padaria Trigal;${cnpj};Paula;paula-csv@example.com;11 98888-7777;sim`,
      'Mercado Azul;123;;;;',
      ';;Carlos;carlos-csv@example.com;;',
      `Padaria Clonada;${cnpj};;;;`,
    ].join('\n');

    const res = await api.post('/companies/import', { csv });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ total: 4, failed: 3 });

    const [ok, badCnpj, missingName, duplicated] = res.body.data.lines;
    expect(ok).toMatchObject({ line: 2, status: 'pending', name: 'Padaria Trigal' });
    expect(ok.body).toMatchObject({
      name: 'Padaria Trigal',
      cnpj,
      flags: { has_employees: true },
      contact: { name: 'Paula', email: 'paula-csv@example.com', phone: '11988887777' },
    });

    expect(badCnpj).toMatchObject({ line: 3, status: 'error' });
    expect(badCnpj.error).toContain('cnpj');
    expect(missingName).toMatchObject({ line: 4, status: 'error' });
    expect(missingName.error).toContain('Informe o nome da Empresa.');
    expect(duplicated).toMatchObject({
      line: 5,
      status: 'error',
      error: 'CNPJ repetido na planilha (já aparece na linha 2).',
    });
  });

  it('prévia não grava empresa nenhuma', async () => {
    const res = await api.get('/companies');
    expect(res.body.meta.total).toBe(0);
  });

  it('mais de 1000 linhas → 422 pedindo lotes', async () => {
    const csv = `name\n${Array.from({ length: 1001 }, (_, i) => `Empresa ${i}`).join('\n')}`;
    const res = await api.post('/companies/import', { csv });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('o limite por importação é 1000');
  });

  it('csv vazio → 422 do contrato', async () => {
    const res = await api.post('/companies/import', { csv: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /companies/import/confirm — gravação', () => {
  let api: Api;
  let userId: string;
  let templateId: string;
  let fixedCnpj: string;
  let importedId: string;

  beforeAll(async () => {
    ({ api, userId } = await registerFirm(app.url));
    templateId = await createTemplate(api, []);
    fixedCnpj = validCnpj();
  });

  it('prévia → confirm: grava empresas, template, contatos; ativa o que coube', async () => {
    const mine = await accountantIdOf(userId);
    const pending = [
      {
        line: 2,
        body: {
          name: 'Importada Um',
          cnpj: fixedCnpj,
          checklistTemplateId: templateId,
          responsibleAccountantId: mine,
          contact: { name: 'Ivo', email: 'ivo-import@example.com' },
        },
      },
      { line: 3, body: { name: 'Importada Dois' } },
    ];

    const res = await api.post('/companies/import/confirm', { pending });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ total: 2, created: 2, activated: 2, failed: 0 });
    importedId = res.body.data.lines[0].companyId;

    const got = await api.get(`/companies/${importedId}`);
    expect(got.body.data).toMatchObject({
      name: 'Importada Um',
      cnpj: fixedCnpj,
      active: true,
      checklistTemplateId: templateId,
    });
    expect(got.body.data.contacts).toHaveLength(1);
    expect(got.body.data.contacts[0]).toMatchObject({
      name: 'Ivo',
      email: 'ivo-import@example.com',
    });
  });

  /* Validar um campo a cada importação e nunca gravá-lo é pior que não aceitá-lo: a planilha
   * diz quem responde pela Empresa e a tela mostrava ninguém. */
  it('responsibleAccountantId da planilha é gravado', async () => {
    const mine = await accountantIdOf(userId);
    const got = await api.get(`/companies/${importedId}`);
    expect(got.body.data.responsibleAccountantId).toBe(mine);
  });

  it('reenvio do mesmo CNPJ faz upsert: renomeia sem duplicar e reporta "created"', async () => {
    const res = await api.post('/companies/import/confirm', {
      pending: [
        {
          line: 2,
          body: {
            name: 'Importada Renomeada',
            cnpj: fixedCnpj,
            contact: { name: 'Ivo Renomeado', email: 'ivo-import@example.com' },
          },
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.lines[0]).toMatchObject({
      status: 'created',
      companyId: importedId,
      name: 'Importada Renomeada',
    });

    const list = await api.get('/companies');
    expect(list.body.meta.total).toBe(2);

    const roster = await api.get(`/companies/${importedId}/contacts`);
    expect(roster.body.data).toHaveLength(1);
    expect(roster.body.data[0].name).toBe('Ivo Renomeado');
  });

  it('reenvio sem as colunas não apaga template, contador, flags, nome nem telefone do Responsável', async () => {
    const mine = await accountantIdOf(userId);
    const cnpj = validCnpj();
    const first = await api.post('/companies/import/confirm', {
      pending: [
        {
          line: 2,
          body: {
            name: 'Preservada',
            cnpj,
            checklistTemplateId: templateId,
            responsibleAccountantId: mine,
            flags: { has_employees: true, has_inventory: true },
            contact: { name: 'Rita', email: 'rita-import@example.com', phone: '11977776666' },
          },
        },
      ],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const companyId = first.body.data.lines[0].companyId;

    /* O que a prévia manda para uma planilha só com nome, CNPJ, e-mail e uma coluna de
     * flag: o nome do Responsável cai para o da Empresa. */
    const again = await api.post('/companies/import/confirm', {
      pending: [
        {
          line: 2,
          body: {
            name: 'Preservada',
            cnpj,
            flags: { has_inventory: false },
            contact: { name: 'Preservada', email: 'rita-import@example.com' },
          },
        },
      ],
    });
    expect(again.status, JSON.stringify(again.body)).toBe(201);

    const got = await api.get(`/companies/${companyId}`);
    expect(got.body.data).toMatchObject({
      checklistTemplateId: templateId,
      responsibleAccountantId: mine,
      flags: { has_employees: true, has_inventory: false },
    });
    expect(got.body.data.contacts[0]).toMatchObject({ name: 'Rita', phone: '11977776666' });
  });

  it('activate:false importa tudo desativado; reimportar com activate:true NÃO reativa', async () => {
    const cnpj = validCnpj();
    const off = await api.post('/companies/import/confirm', {
      pending: [{ line: 2, body: { name: 'Dormindo', cnpj } }],
      activate: false,
    });
    expect(off.body.data).toMatchObject({ activated: 0 });
    expect(off.body.data.lines[0].active).toBe(false);

    const retry = await api.post('/companies/import/confirm', {
      pending: [{ line: 2, body: { name: 'Dormindo', cnpj } }],
      activate: true,
    });
    expect(retry.body.data.lines[0].active).toBe(false);
    expect(retry.body.data).toMatchObject({ activated: 0 });
  });

  it('CNPJ repetido no lote → 422 antes de gravar', async () => {
    const cnpj = validCnpj();
    const res = await api.post('/companies/import/confirm', {
      pending: [
        { line: 2, body: { name: 'A', cnpj } },
        { line: 3, body: { name: 'B', cnpj } },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('A planilha tem o mesmo CNPJ em mais de uma linha.');
  });

  it('template ou contador de fora → 422', async () => {
    const badTemplate = await api.post('/companies/import/confirm', {
      pending: [{ line: 2, body: { name: 'X', checklistTemplateId: GHOST } }],
    });
    expect(badTemplate.status).toBe(422);
    expect(badTemplate.body.error.message).toContain('Template de checklist inexistente');

    const badAccountant = await api.post('/companies/import/confirm', {
      pending: [{ line: 2, body: { name: 'X', responsibleAccountantId: GHOST } }],
    });
    expect(badAccountant.status).toBe(422);
    expect(badAccountant.body.error.message).toContain('Contador responsável inexistente');
  });

  it('pending vazio → 422', async () => {
    const res = await api.post('/companies/import/confirm', { pending: [] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /companies/access-invites', () => {
  let api: Api;
  let firmEmail: string;
  let withContact: { id: string };
  let accountOwner: { id: string };
  let withoutContact: { id: string };

  beforeAll(async () => {
    ({ api, email: firmEmail } = await registerFirm(app.url));
    withContact = await createCompany(api, {
      name: 'Convidável',
      contact: { name: 'Nina', email: 'nina-invite@example.com' },
    });
    /* O dono da firma já tem conta (user criado no registro): convidar este email é o
     * caminho do "já tem conta cadastrada". */
    accountOwner = await createCompany(api, {
      name: 'Do Dono',
      contact: { name: 'Dono', email: firmEmail },
    });
    withoutContact = await createCompany(api, { name: 'Muda' });
  });

  it('convida o responsável: cria invite com hash, TTL de 7 dias e autoria', async () => {
    const res = await api.post('/companies/access-invites', { companyIds: [withContact.id] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.invited).toBe(1);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.results).toEqual([
      {
        companyId: withContact.id,
        companyName: 'Convidável',
        email: 'nina-invite@example.com',
        status: 'invited',
      },
    ]);

    const rows = await db.select().from(invite).where(eq(invite.companyId, withContact.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'nina-invite@example.com',
      accountingFirmId: null,
      acceptedAt: null,
      deletedAt: null,
    });
    expect(rows[0].tokenHash).toHaveLength(64);
    expect(rows[0].createdBy).not.toBeNull();
    const ttlDays = (rows[0].expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(6.9);
    expect(ttlDays).toBeLessThan(7.1);
  });

  it('WIP congelado: reconvidar revoga o pendente e reemite (não pula mais)', async () => {
    const res = await api.post('/companies/access-invites', { companyIds: [withContact.id] });
    expect(res.status).toBe(201);
    expect(res.body.data.invited).toBe(1);
    expect(res.body.data.results[0].status).toBe('invited');

    const rows = await db
      .select()
      .from(invite)
      .where(eq(invite.companyId, withContact.id))
      .orderBy(asc(invite.createdAt));
    expect(rows).toHaveLength(2);
    expect(rows[0].deletedAt).not.toBeNull();
    expect(rows[1].deletedAt).toBeNull();
    expect(rows[1].tokenHash).not.toBe(rows[0].tokenHash);
  });

  it('email com conta, empresa sem responsável e empresa inexistente: tudo em skipped', async () => {
    const res = await api.post('/companies/access-invites', {
      companyIds: [accountOwner.id, withoutContact.id, GHOST],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.invited).toBe(0);
    expect(res.body.data.skipped).toBe(3);
    expect(res.body.data.results).toEqual([
      {
        companyId: accountOwner.id,
        companyName: 'Do Dono',
        email: firmEmail,
        status: 'skipped',
        reason: 'Este e-mail já tem uma conta cadastrada.',
      },
      {
        companyId: withoutContact.id,
        companyName: 'Muda',
        status: 'skipped',
        reason: 'Empresa sem Responsável cadastrado.',
      },
      { companyId: GHOST, status: 'error', reason: 'Empresa não encontrada.' },
    ]);

    const rows = await db.select().from(invite).where(eq(invite.companyId, accountOwner.id));
    expect(rows).toHaveLength(0);
  });

  it('convite de acesso não loga em message (email sai sem registro)', async () => {
    /* O listener do ContactInvited usa sendWithoutLog; nenhum outro teste deste arquivo
     * abre competência, então a tabela precisa seguir vazia. */
    await app.drainEvents();
    const rows = await db.select({ id: message.id }).from(message);
    expect(rows).toHaveLength(0);
  });

  it('corpo inválido → 422', async () => {
    for (const body of [{ companyIds: [] }, { companyIds: ['nao-e-uuid'] }, {}]) {
      const res = await api.post('/companies/access-invites', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('POST /companies/apply-template', () => {
  let api: Api;
  let templateId: string;
  let foreignTemplateId: string;
  let c1: { id: string };
  let c2: { id: string };

  beforeAll(async () => {
    const [mine, other] = await Promise.all([registerFirm(app.url), registerFirm(app.url)]);
    api = mine.api;
    templateId = await createTemplate(api, []);
    foreignTemplateId = await createTemplate(other.api, []);
    c1 = await createCompany(api, { name: 'Com Template Um' });
    c2 = await createCompany(api, { name: 'Com Template Dois' });
  });

  it('aplica em lote e reporta empresa não encontrada por linha', async () => {
    const res = await api.post('/companies/apply-template', {
      companyIds: [c1.id, c2.id, GHOST],
      checklistTemplateId: templateId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.results).toEqual([
      { companyId: c1.id, status: 'updated' },
      { companyId: c2.id, status: 'updated' },
      { companyId: GHOST, status: 'error', reason: 'Empresa não encontrada.' },
    ]);

    const got = await api.get(`/companies/${c1.id}`);
    expect(got.body.data.checklistTemplateId).toBe(templateId);
  });

  it('template de outra Contabilidade → 422 sem tocar em nada', async () => {
    const res = await api.post('/companies/apply-template', {
      companyIds: [c1.id],
      checklistTemplateId: foreignTemplateId,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      'Template de checklist inexistente ou de outra Contabilidade.',
    );
  });

  it('corpo inválido → 422', async () => {
    const res = await api.post('/companies/apply-template', {
      companyIds: [],
      checklistTemplateId: templateId,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET/PATCH/DELETE /companies/:id', () => {
  let api: Api;
  let templateId: string;
  let target: { id: string };
  let neighborCnpj: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    templateId = await createTemplate(api, []);
    target = await createCompany(api, {
      name: 'Alvo',
      cnpj: validCnpj(),
      flags: { has_employees: true },
      contact: contactBody('Rita'),
    });
    neighborCnpj = validCnpj();
    await createCompany(api, { name: 'Vizinha', cnpj: neighborCnpj });
  });

  it('GET :id devolve detalhe com template, responsável e contatos', async () => {
    const res = await api.get(`/companies/${target.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: target.id,
      name: 'Alvo',
      active: true,
      flags: { has_employees: true },
      checklistTemplateId: null,
      templateName: null,
      responsibleAccountantId: null,
      responsibleAccountantName: null,
    });
    expect(res.body.data.contacts).toHaveLength(1);
    expect(res.body.data.contacts[0]).toMatchObject({ name: 'Rita', hasAccess: false });
  });

  it('PATCH troca nome e template; templateName acompanha', async () => {
    const res = await api.patch(`/companies/${target.id}`, {
      name: 'Alvo Novo',
      checklistTemplateId: templateId,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Alvo Novo', checklistTemplateId: templateId });

    const got = await api.get(`/companies/${target.id}`);
    expect(got.body.data.templateName).not.toBeNull();
  });

  it('PATCH parcial de flags MESCLA em vez de substituir', async () => {
    const res = await api.patch(`/companies/${target.id}`, {
      flags: { accepts_card_payments: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.flags).toEqual({ has_employees: true, accepts_card_payments: true });
  });

  it('PATCH para o CNPJ de outra empresa → 422', async () => {
    const res = await api.patch(`/companies/${target.id}`, { cnpj: neighborCnpj });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Já existe uma empresa com este CNPJ.');
  });

  it('PATCH com tipo errado → 422', async () => {
    const res = await api.patch(`/companies/${target.id}`, { active: 'sim' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  /* PATCH sem campo nenhum é erro do cliente, não do servidor: o contrato recusa antes de
   * chegar ao drizzle, que estouraria com `No values to set`. */
  it('PATCH com corpo vazio → 422', async () => {
    const res = await api.patch(`/companies/${target.id}`, {});
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE desativa (soft): devolve a linha inativa e o registro continua existindo', async () => {
    const res = await api.delete(`/companies/${target.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: target.id, active: false });

    const got = await api.get(`/companies/${target.id}`);
    expect(got.status).toBe(200);
    expect(got.body.data.active).toBe(false);
  });

  it('id desconhecido → 404 NOT_FOUND; id mal formado → 422', async () => {
    for (const res of await Promise.all([
      api.get(`/companies/${GHOST}`),
      api.patch(`/companies/${GHOST}`, { name: 'X' }),
      api.delete(`/companies/${GHOST}`),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Empresa não encontrada.');
    }

    const malformed = await api.get('/companies/nao-e-uuid');
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('responsáveis (contacts) e acesso ao app', () => {
  let api: Api;
  let companyId: string;
  let firstId: string;
  let freshId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    const created = await createCompany(api, {
      name: 'Cheia de Gente',
      contact: { name: 'Olga', email: 'olga-contacts@example.com' },
    });
    companyId = created.id;
    firstId = (created as any).contacts[0].id;
  });

  it('GET :id/contacts lista com hasAccess', async () => {
    const res = await api.get(`/companies/${companyId}/contacts`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: firstId,
        name: 'Olga',
        email: 'olga-contacts@example.com',
        phone: null,
        hasAccess: false,
      },
    ]);
  });

  it('POST cria responsável; email inválido → 422; empresa alheia → 404', async () => {
    const res = await api.post(`/companies/${companyId}/contacts`, {
      name: 'Pedro',
      email: 'pedro-contacts@example.com',
      phone: '11 97777-6666',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      companyId,
      name: 'Pedro',
      email: 'pedro-contacts@example.com',
      phone: '11977776666',
      authUserId: null,
    });
    freshId = res.body.data.id;

    const invalid = await api.post(`/companies/${companyId}/contacts`, {
      name: 'X',
      email: 'nao-e-email',
    });
    expect(invalid.status).toBe(422);

    const ghost = await api.post(`/companies/${GHOST}/contacts`, contactBody());
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.message).toBe('Empresa não encontrada.');
  });

  it('PATCH edita parcialmente; contato desconhecido → 404', async () => {
    const res = await api.patch(`/companies/${companyId}/contacts/${freshId}`, {
      name: 'Pedro Silva',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: freshId, name: 'Pedro Silva' });

    const ghost = await api.patch(`/companies/${companyId}/contacts/${GHOST}`, { name: 'X' });
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.message).toBe('Responsável não encontrado.');
  });

  it('PATCH de contato com corpo vazio → 422', async () => {
    const res = await api.patch(`/companies/${companyId}/contacts/${freshId}`, {});
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE apaga de verdade (204 sem corpo); repetir → 404', async () => {
    const res = await api.delete(`/companies/${companyId}/contacts/${freshId}`);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();

    const rows = await db.select({ id: contact.id }).from(contact).where(eq(contact.id, freshId));
    expect(rows).toHaveLength(0);

    const again = await api.delete(`/companies/${companyId}/contacts/${freshId}`);
    expect(again.status).toBe(404);
  });

  it('acesso: lista só quem ativou conta e a revogação apaga vínculo e user', async () => {
    const empty = await api.get(`/companies/${companyId}/contacts/access`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const [seeded] = await db
      .insert(userTable)
      .values({ name: 'Olga App', email: 'olga-app@example.com' })
      .returning({ id: userTable.id });
    await db.update(contact).set({ authUserId: seeded.id }).where(eq(contact.id, firstId));

    const withAccess = await api.get(`/companies/${companyId}/contacts/access`);
    expect(withAccess.body.data).toEqual([
      { id: firstId, name: 'Olga', email: 'olga-contacts@example.com' },
    ]);

    const list = await api.get('/companies?search=Cheia');
    expect(list.body.data[0]).toMatchObject({ contactCount: 1, readyContactCount: 1 });

    const revoked = await api.delete(`/companies/${companyId}/contacts/${firstId}/access`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data).toEqual({ revoked: true });

    const [linked] = await db
      .select({ authUserId: contact.authUserId })
      .from(contact)
      .where(eq(contact.id, firstId));
    expect(linked.authUserId).toBeNull();
    const ghostUsers = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, seeded.id));
    expect(ghostUsers).toHaveLength(0);
  });

  it('revogar quem não tem acesso → revoked:false; contato desconhecido → 404', async () => {
    const res = await api.delete(`/companies/${companyId}/contacts/${firstId}/access`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revoked: false });

    const ghost = await api.delete(`/companies/${companyId}/contacts/${GHOST}/access`);
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.message).toBe('Responsável não encontrado.');

    const ghostCompany = await api.get(`/companies/${GHOST}/contacts/access`);
    expect(ghostCompany.status).toBe(404);
    expect(ghostCompany.body.error.message).toBe('Empresa não encontrada.');
  });
});

describe('isolamento entre firmas', () => {
  it('empresa de uma firma é invisível para outra em todas as rotas', async () => {
    const [a, b] = await Promise.all([registerFirm(app.url), registerFirm(app.url)]);
    const created = await createCompany(a.api, { name: 'Secreta', contact: contactBody('Sigilo') });
    const contactId = (created as any).contacts[0].id;

    for (const res of await Promise.all([
      b.api.get(`/companies/${created.id}`),
      b.api.patch(`/companies/${created.id}`, { name: 'Invadida' }),
      b.api.delete(`/companies/${created.id}`),
      b.api.get(`/companies/${created.id}/contacts`),
      b.api.post(`/companies/${created.id}/contacts`, contactBody()),
      b.api.patch(`/companies/${created.id}/contacts/${contactId}`, { name: 'X' }),
      b.api.delete(`/companies/${created.id}/contacts/${contactId}`),
      b.api.get(`/companies/${created.id}/contacts/access`),
      b.api.delete(`/companies/${created.id}/contacts/${contactId}/access`),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }

    const invites = await b.api.post('/companies/access-invites', { companyIds: [created.id] });
    expect(invites.status).toBe(201);
    expect(invites.body.data.results).toEqual([
      { companyId: created.id, status: 'error', reason: 'Empresa não encontrada.' },
    ]);

    const list = await b.api.get('/companies');
    expect(list.body.data).toEqual([]);
    expect(list.body.meta.total).toBe(0);

    const mine = await a.api.get(`/companies/${created.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.name).toBe('Secreta');
  });
});

/* Trocar o e-mail do Responsável é trocar a PESSOA. O Link de Upload resolve pelo `contact.id`
 * lendo o e-mail ao vivo, então o token que ficou com o antigo passaria a ativar conta no
 * endereço do novo. Cada Link aberto ganha token novo, o antigo morre na hora e o novo
 * endereço recebe o link — sem revogar a linha, que mataria também os tokens seguintes. */
describe('PATCH contato: troca de e-mail rotaciona o Link de Upload', () => {
  let api: Api;
  let companyId: string;
  let contactId: string;
  let requestId: string;
  let uploadToken: string;

  const linkRow = () =>
    db
      .select({
        tokenHash: uploadLink.tokenHash,
        previousTokenHash: uploadLink.previousTokenHash,
        revoked: uploadLink.revoked,
      })
      .from(uploadLink)
      .where(eq(uploadLink.requestId, requestId))
      .then((rows) => rows[0]);

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url, 'Contabilidade Troca de Pessoa'));
    const [documentTypeId] = await documentTypeIds(api, 1);
    const templateId = await createTemplate(api, [{ documentTypeId }]);
    const created = await createCompany(api, {
      name: 'Troca SA',
      checklistTemplateId: templateId,
      contact: contactBody('Antiga'),
    });
    companyId = created.id;
    contactId = (created.contacts as Array<{ id: string }>)[0].id;

    const opened = await api.post('/periods', { referenceMonth: '2026-08' });
    expect(opened.status, JSON.stringify(opened.body)).toBe(201);
    requestId = opened.body.data.requests[0].id;
    uploadToken = opened.body.data.requests[0].uploadUrl.split('/envio/')[1];
  });

  it('Responsável sem conta: o token antigo morre na hora e o novo e-mail recebe o reenvio', async () => {
    const before = await linkRow();
    expect((await apiClient(app.url).get(`/upload/${uploadToken}`)).status).toBe(200);
    const subscribed = await apiClient(app.url).post(`/upload/${uploadToken}/push`, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho-da-antiga',
      keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
    });
    expect(subscribed.status, JSON.stringify(subscribed.body)).toBe(201);

    const res = await api.patch(`/companies/${companyId}/contacts/${contactId}`, {
      email: 'nova-pessoa@example.com',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.undeliveredLinks, 'o e-mail com o link novo saiu').toBe(0);
    await app.drainEvents();

    const devices = await db
      .select({ id: pushSubscription.id })
      .from(pushSubscription)
      .where(eq(pushSubscription.contactId, contactId));
    expect(devices, 'o aparelho da pessoa que saiu para de receber').toEqual([]);

    const after = await linkRow();
    expect(after.tokenHash).not.toBe(before.tokenHash);
    expect(after.previousTokenHash, 'sem carência: a pessoa mudou').toBeNull();
    expect(after.revoked).toBe(false);
    expect((await apiClient(app.url).get(`/upload/${uploadToken}`)).status).toBe(404);

    const deliveries = await db
      .select({ purpose: message.purpose, recipient: message.recipient, status: message.status })
      .from(message)
      .where(eq(message.requestId, requestId));
    expect(deliveries.filter((row) => row.purpose === 'resend')).toEqual([
      { purpose: 'resend', recipient: 'nova-pessoa@example.com', status: 'sent' },
    ]);
  });

  it('mudar só a caixa do e-mail não é troca de pessoa: grava minúsculo e não mexe no Link', async () => {
    const before = await linkRow();
    const res = await api.patch(`/companies/${companyId}/contacts/${contactId}`, {
      email: 'Nova-Pessoa@Example.COM',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.email).toBe('nova-pessoa@example.com');
    expect((await linkRow()).tokenHash).toBe(before.tokenHash);
  });

  it('mudar só o nome não mexe no Link', async () => {
    const before = await linkRow();
    const res = await api.patch(`/companies/${companyId}/contacts/${contactId}`, { name: 'Nova' });
    expect(res.status).toBe(200);
    expect((await linkRow()).tokenHash).toBe(before.tokenHash);
  });

  it('Responsável com conta: o vínculo cai, e o link que o Contador reenvia depois funciona', async () => {
    const [seeded] = await db
      .insert(userTable)
      .values({ name: 'Nova App', email: 'nova-pessoa@example.com' })
      .returning({ id: userTable.id });
    await db.update(contact).set({ authUserId: seeded.id }).where(eq(contact.id, contactId));

    const res = await api.patch(`/companies/${companyId}/contacts/${contactId}`, {
      email: 'terceira-pessoa@example.com',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await app.drainEvents();

    const [linked] = await db
      .select({ authUserId: contact.authUserId })
      .from(contact)
      .where(eq(contact.id, contactId));
    expect(linked.authUserId).toBeNull();
    expect((await linkRow()).revoked).toBe(false);

    const resent = await api.post(`/requests/${requestId}/upload-link/resend`);
    expect(resent.status, JSON.stringify(resent.body)).toBe(201);
    const freshToken = resent.body.data.uploadUrl.split('/envio/')[1];
    expect((await apiClient(app.url).get(`/upload/${freshToken}`)).status).toBe(200);
  });
});

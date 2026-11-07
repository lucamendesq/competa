import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3100';
const API_LOG = process.env.API_LOG ?? '';
const INVITE_TOKEN = process.env.INVITE_TOKEN ?? '';
const OUT = process.env.OUT_DIR ?? __dirname;
const PASSWORD = 'senha-forte-123';
const OWNER = { name: 'Ana Dono', email: 'dono@exemplo.com.br' };
const MEMBER = { name: 'Bruno Membro', email: 'membro@exemplo.com.br' };
const CONTACT_EMAIL = 'carla@mercado.com.br';
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'api-db-1';
const DB_NAME = process.env.DB_NAME ?? 'competa_baseline';

const sql = (statement: string) =>
  execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', DB_NAME, '-tAc', statement],
    {
      encoding: 'utf8',
    },
  );

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
type Viewport = keyof typeof VIEWPORTS;

type Row = { file: string; route: string; viewport: Viewport; state: string; observe: string };
const rows: Row[] = [];
const failures: string[] = [];

const slugOf = (route: string) =>
  route
    .replace(/^\//, '')
    .replace(/\?.*$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+$/, '') || 'raiz';

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
};

type Interaction = (page: Page, viewport: Viewport) => Promise<void>;

async function shoot(
  ctx: BrowserContext,
  route: string,
  state: string,
  observe: string,
  options: { interact?: Interaction; slug?: string; viewports?: Viewport[] } = {},
) {
  for (const viewport of options.viewports ?? (['desktop', 'mobile'] as Viewport[])) {
    const page = await ctx.newPage();
    await page.setViewportSize(VIEWPORTS[viewport]);
    const file = `${options.slug ?? slugOf(route)}__${viewport}__${state}.png`;
    try {
      await page.goto(`${WEB}${route}`);
      await settle(page);
      if (options.interact) {
        await options.interact(page, viewport);
        await settle(page);
      }
      await page.screenshot({ path: join(OUT, file), fullPage: true });
      rows.push({ file, route, viewport, state, observe });
    } catch (error) {
      failures.push(`${file}: ${(error as Error).message.split('\n')[0]}`);
      await page.screenshot({ path: join(OUT, file), fullPage: true }).catch(() => undefined);
      rows.push({ file, route, viewport, state: `${state} (interação falhou)`, observe });
    } finally {
      await page.close();
    }
  }
}

async function call<T = unknown>(
  ctx: BrowserContext,
  method: string,
  path: string,
  data?: unknown,
) {
  const response = await ctx.request.fetch(`${API}${path}`, {
    method,
    data,
    headers: { Origin: WEB, 'Content-Type': 'application/json' },
  });
  const text = await response.text();
  if (!response.ok()) throw new Error(`${method} ${path} → ${response.status()} ${text}`);
  const body = text ? JSON.parse(text) : null;
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

async function signIn(ctx: BrowserContext, email: string) {
  await call(ctx, 'POST', '/api/auth/sign-in/email', { email, password: PASSWORD });
}

const lastLogUrl = (pattern: RegExp) => {
  const matches = readFileSync(API_LOG, 'utf8').match(new RegExp(pattern, 'g')) ?? [];
  const last = matches.at(-1);
  if (!last) throw new Error(`nenhuma URL ${pattern} no log da API`);
  return last;
};

const tokenOf = (url: string) => url.split('/').pop()!.split('?')[0];

const fixtureFiles = () => {
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  return [
    { fileName: 'extrato-novembro.pdf', contentType: 'application/pdf', body: pdf },
    { fileName: 'comprovante.png', contentType: 'image/png', body: png },
  ];
};

async function uploadThroughLink(
  ctx: BrowserContext,
  token: string,
  requestItemId: string | null,
  file: { fileName: string; contentType: string; body: Buffer },
) {
  const checksumSha256 = createHash('sha256').update(file.body).digest('base64');
  const presign = await call<{
    files: { accepted: boolean; documentId: string; uploadUrl: string }[];
  }>(ctx, 'POST', `/upload/${token}/documents`, {
    requestItemId,
    files: [
      {
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.body.length,
        checksumSha256,
      },
    ],
  });
  const [presigned] = presign.files;
  if (!presigned?.accepted) throw new Error(`presign recusado para ${file.fileName}`);
  const put = await ctx.request.fetch(presigned.uploadUrl, {
    method: 'PUT',
    data: file.body,
    headers: {
      'Content-Type': file.contentType,
      'x-amz-checksum-sha256': checksumSha256,
      Origin: WEB,
    },
  });
  if (!put.ok()) throw new Error(`PUT ${presigned.uploadUrl} → ${put.status()}`);
  await call(ctx, 'POST', `/upload/${token}/documents/confirm`, {
    documentIds: [presigned.documentId],
  });
}

const clickRole = (page: Page, role: Parameters<Page['getByRole']>[0], name: RegExp) =>
  page.getByRole(role, { name }).first().click({ timeout: 5000 });

const openMobileMenu: Interaction = async (page, viewport) => {
  if (viewport === 'mobile') await clickRole(page, 'button', /Abrir menu/);
};

async function main() {
  if (!API_LOG || !INVITE_TOKEN) throw new Error('defina API_LOG e INVITE_TOKEN');
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const newContext = () =>
    browser.newContext({ deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });

  const guest = await newContext();
  await shoot(
    guest,
    '/entrar',
    'inicial',
    'campos e-mail/senha, link "Esqueci minha senha", link para cadastro',
  );
  await shoot(
    guest,
    '/cadastro',
    'passo-1',
    'passo 1 de 2: dados do Contador, consentimento dos Termos',
  );
  await shoot(
    guest,
    '/cadastro',
    'passo-2',
    'passo 2 de 2: dados da Contabilidade (nome, CNPJ opcional)',
    {
      interact: async (page) => {
        await page.getByLabel(/nome/i).first().fill('Joana Teste');
        await page
          .getByLabel(/e-mail/i)
          .first()
          .fill('joana@teste.com.br');
        await page.getByLabel(/senha/i).first().fill(PASSWORD);
        const terms = page.getByRole('checkbox');
        if (await terms.count()) await terms.first().check();
        await clickRole(page, 'button', /Continuar|Próximo|Avançar/);
      },
    },
  );
  await shoot(guest, '/esqueci-senha', 'inicial', 'campo de e-mail e botão de enviar');
  await shoot(guest, '/esqueci-senha', 'enviado', 'confirmação cega de envio', {
    interact: async (page) => {
      await page
        .getByLabel(/e-mail/i)
        .first()
        .fill('ninguem@exemplo.com.br');
      await clickRole(page, 'button', /Enviar|Recuperar|Redefinir/);
    },
  });
  await shoot(
    guest,
    '/redefinir-senha?token=x',
    'invalido',
    '"Link inválido" ao submeter token adulterado',
    {
      interact: async (page) => {
        const fields = page.locator('input[type="password"]');
        for (let i = 0; i < (await fields.count()); i++) await fields.nth(i).fill(PASSWORD);
        await clickRole(page, 'button', /Redefinir|Salvar|Definir/);
      },
    },
  );
  await shoot(guest, '/termos', 'inicial', 'texto dos Termos de Uso');
  await shoot(guest, '/privacidade', 'inicial', 'texto da Política de Privacidade');
  await shoot(guest, '/nao-existe', 'inicial', 'página 404 com link de volta', { slug: '404' });
  await shoot(guest, '/perdi-meu-link', 'inicial', 'campo de e-mail do Responsável');
  await shoot(guest, '/perdi-meu-link', 'enviado', 'resposta cega "se houver…"', {
    interact: async (page) => {
      await page
        .getByLabel(/e-mail/i)
        .first()
        .fill('ninguem@exemplo.com.br');
      await clickRole(page, 'button', /Enviar|Receber|Recuperar/);
    },
  });
  await shoot(
    guest,
    '/perdi-meu-link/confirmar?token=x',
    'inicial',
    'botão de confirmação (API só no clique)',
  );
  await shoot(
    guest,
    '/envio/token-invalido',
    'invalido',
    'link expirado/inválido levando ao "Perdi meu link"',
  );
  await shoot(
    guest,
    '/minha-area/acesso',
    'inicial',
    'entrada do Responsável: senha e link por e-mail',
  );
  await shoot(guest, '/minha-area/acesso', 'link-enviado', 'confirmação do link mágico enviado', {
    interact: async (page) => {
      await page
        .getByLabel(/e-mail/i)
        .last()
        .fill('ninguem@exemplo.com.br');
      await clickRole(page, 'button', /Receber link por e-mail/);
    },
  });

  const owner = await newContext();
  await call(owner, 'POST', '/auth/sign-up', { ...OWNER, password: PASSWORD, token: INVITE_TOKEN });
  await signIn(owner, OWNER.email);

  await shoot(
    owner,
    '/competencias',
    'vazio',
    'estado vazio antes de abrir qualquer competência; KPIs zerados',
  );
  await shoot(owner, '/empresas', 'vazio', 'estado vazio com chamada para cadastrar/importar');

  const templates = await call<{ id: string; name: string; derivedFrom: string | null }[]>(
    owner,
    'GET',
    '/checklist-templates',
  );
  const productTemplate = templates[0];
  const noContact = await call<{ id: string }>(owner, 'POST', '/companies', {
    name: 'Padaria Pão Quente',
    flags: {},
  });
  const oneContact = await call<{ id: string }>(owner, 'POST', '/companies', {
    name: 'Mercado Bom Preço',
    cnpj: '11222333000181',
    flags: { has_employees: true },
    contact: { name: 'Carla Souza', email: CONTACT_EMAIL },
  });
  const twoContacts = await call<{ id: string }>(owner, 'POST', '/companies', {
    name: 'Oficina Roda Viva',
    flags: {},
    contact: { name: 'Diego Lima', email: 'diego@oficina.com.br', phone: '11987654321' },
  });
  await call(owner, 'POST', `/companies/${twoContacts.id}/contacts`, {
    name: 'Elisa Prado',
    email: 'elisa@oficina.com.br',
  });
  await call(owner, 'POST', '/companies/apply-template', {
    companyIds: [oneContact.id, twoContacts.id],
    checklistTemplateId: productTemplate.id,
  });

  const effective = await call<{ items: { documentTypeId: string }[] }>(
    owner,
    'GET',
    `/companies/${twoContacts.id}/checklist`,
  );
  const inTemplate = new Set(effective.items.map((item) => item.documentTypeId));
  const documentTypes = await call<{ items?: { id: string }[] } | { id: string }[]>(
    owner,
    'GET',
    '/document-types?pageSize=100',
  );
  const typeList = Array.isArray(documentTypes) ? documentTypes : (documentTypes.items ?? []);
  const extraType = typeList.find((type) => !inTemplate.has(type.id));
  if (extraType) {
    await call(owner, 'PUT', `/companies/${twoContacts.id}/checklist-overrides`, {
      documentTypeId: extraType.id,
      action: 'add',
      periodicity: 'monthly',
    });
  }

  const derived = await call<{ id: string }>(
    owner,
    'POST',
    `/checklist-templates/${productTemplate.id}/derive`,
    {
      name: 'Modelo do escritório',
    },
  );
  const derivedDetail = await call<{ items: { id: string }[] }>(
    owner,
    'GET',
    `/checklist-templates/${derived.id}`,
  );
  if (derivedDetail.items[0]) {
    await call(
      owner,
      'PATCH',
      `/checklist-templates/${derived.id}/items/${derivedDetail.items[0].id}`,
      {
        dueDay: 15,
      },
    );
  }

  const today = new Date();
  const referenceMonth = today.toISOString().slice(0, 7);
  const dueDate = new Date(today.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);

  await shoot(
    owner,
    '/competencias',
    'modal-abertura',
    'modal "Abrir competência" com prévia do fan-out',
    {
      interact: async (page) => {
        await clickRole(page, 'button', /Abrir competência/);
        await page.waitForTimeout(800);
      },
    },
  );

  const opening = await call<{
    id: string;
    requests: { id: string; companyName: string; uploadUrl: string }[];
  }>(owner, 'POST', '/periods', { referenceMonth, dueDate });
  const mercado = opening.requests.find((request) => request.companyName === 'Mercado Bom Preço')!;
  const oficina = opening.requests.find((request) => request.companyName === 'Oficina Roda Viva')!;
  const mercadoToken = tokenOf(mercado.uploadUrl);
  const oficinaToken = tokenOf(oficina.uploadUrl);

  await shoot(
    guest,
    `/envio/${oficinaToken}`,
    'com-pendencias',
    'itens pendentes com prazo, área de envio, extras',
    {
      slug: 'envio-token',
    },
  );

  const mercadoDetail = await call<{ items: { id: string; documents: { id: string }[] }[] }>(
    owner,
    'GET',
    `/requests/${mercado.id}`,
  );
  const [pdf, png] = fixtureFiles();
  await uploadThroughLink(guest, mercadoToken, mercadoDetail.items[0].id, pdf);
  if (mercadoDetail.items[1])
    await uploadThroughLink(guest, mercadoToken, mercadoDetail.items[1].id, png);
  await uploadThroughLink(guest, mercadoToken, null, { ...pdf, fileName: 'documento-extra.pdf' });

  const afterUpload = await call<{ items: { id: string; documents: { id: string }[] }[] }>(
    owner,
    'GET',
    `/requests/${mercado.id}`,
  );
  await shoot(
    owner,
    `/solicitacoes/${mercado.id}`,
    'com-pendentes',
    'documentos aguardando revisão, extras, aceitar/rejeitar',
    { slug: 'solicitacoes-id' },
  );

  const rejectedDocument = afterUpload.items[1]?.documents[0];
  await call(owner, 'POST', `/requests/${mercado.id}/review`, {
    acceptItemIds: [afterUpload.items[0].id],
    rejectDocuments: rejectedDocument
      ? [{ documentId: rejectedDocument.id, rejectionReason: 'Arquivo ilegível, envie de novo.' }]
      : [],
  });
  const resent = await call<{ contactEmail: string }>(
    owner,
    'POST',
    `/requests/${mercado.id}/upload-link/resend`,
  ).catch(() => null);
  const rotatedMercado = tokenOf(lastLogUrl(/https?:\/\/[^\s"']+\/envio\/[A-Za-z0-9_-]+/));
  const mercadoLinkToken = resent ? rotatedMercado : mercadoToken;

  await shoot(
    owner,
    `/solicitacoes/${mercado.id}`,
    'com-rejeicao',
    'item aceito, item rejeitado com motivo, extras',
    {
      slug: 'solicitacoes-id',
    },
  );
  await shoot(
    guest,
    `/envio/${mercadoLinkToken}`,
    'com-rejeicao',
    'pílula de rejeição com motivo, item aprovado',
    {
      slug: 'envio-token',
    },
  );
  await shoot(
    guest,
    `/envio/${mercadoLinkToken}`,
    'sucesso-ofertas',
    'feedback de envio e ofertas "Ativar avisos"/"Ativar acesso"',
    {
      slug: 'envio-token',
      interact: async (page) => {
        const input = page.locator('input[type="file"]').first();
        await input.setInputFiles({
          name: 'reenvio.pdf',
          mimeType: 'application/pdf',
          buffer: pdf.body,
        });
        await page.waitForTimeout(2500);
      },
    },
  );

  sql(
    `update message set status = 'failed', error = 'Caixa de entrada do destinatário cheia (552 5.2.2).' where id = (select id from message where recipient = 'diego@oficina.com.br' order by created_at limit 1)`,
  );
  await shoot(
    owner,
    `/competencias/${opening.id}/pendencias`,
    'com-dados',
    'quem faltou por Empresa, ações copiar/reenviar, falhas de canal',
    { slug: 'competencias-id-pendencias' },
  );

  const invite = await call<{ url: string }>(owner, 'POST', '/invites', { email: MEMBER.email });
  const memberToken = tokenOf(invite.url);
  await shoot(
    guest,
    `/convite/${memberToken}`,
    'contador',
    'aceite do convite do segundo Contador',
    {
      slug: 'convite-token',
    },
  );

  await call(guest, 'POST', `/upload/${mercadoLinkToken}/access`, { name: 'Carla Souza' });
  const magicLink = lastLogUrl(/https?:\/\/[^\s"']+\/api\/auth\/magic-link\/verify\?[^\s"']+/);

  await shoot(
    owner,
    '/competencias',
    'com-dados',
    'KPIs, tabela paginada, ações de zip e pendências',
  );
  await shoot(owner, '/competencias', 'menu-aberto', 'menu lateral aberto no mobile', {
    viewports: ['mobile'],
    interact: openMobileMenu,
  });
  await shoot(
    owner,
    '/empresas',
    'com-dados',
    'lista, filtros, colunas Responsável/Template/Status',
  );
  await call(owner, 'DELETE', `/companies/${noContact.id}`);
  await shoot(owner, '/empresas', 'inativas', 'filtro Inativas com a Empresa desativada', {
    interact: async (page) => clickRole(page, 'button', /Inativas/),
  });
  await shoot(owner, '/empresas', 'com-selecao', 'seleção em lote e barra de ações', {
    interact: async (page, viewport) => {
      if (viewport === 'mobile') {
        await page.getByRole('checkbox').nth(1).check();
      } else {
        await page.getByLabel('Selecionar todas').check();
      }
    },
  });
  await shoot(
    owner,
    '/empresas/nova',
    'inicial',
    'formulário de nova Empresa, Responsável, prévia do checklist',
  );
  await shoot(
    owner,
    `/empresas/${twoContacts.id}/editar`,
    'dois-responsaveis',
    'Empresa com dois Responsáveis, revogar acesso, desativar',
    { slug: 'empresas-id-editar' },
  );
  await shoot(
    owner,
    `/empresas/${twoContacts.id}/checklist`,
    'com-override',
    'checklist efetivo com item adicionado por override',
    { slug: 'empresas-id-checklist' },
  );
  await shoot(
    owner,
    `/empresas/${twoContacts.id}/checklist`,
    'picker-aberto',
    'CatalogPicker aberto',
    {
      slug: 'empresas-id-checklist',
      interact: async (page) => clickRole(page, 'button', /Adicionar/),
    },
  );
  await shoot(owner, '/empresas/importar', 'inicial', 'dropzone, modelo de planilha');
  const csv = Buffer.from(
    '﻿nome;cnpj;email_responsavel\nEmpresa Nova Ltda;;nova@empresa.com.br\nCNPJ Ruim;123;\n',
  );
  await shoot(
    owner,
    '/empresas/importar',
    'previa-com-erro',
    'prévia por linha com uma linha em erro',
    {
      interact: async (page) => {
        await page
          .locator('input[type="file"]')
          .first()
          .setInputFiles({ name: 'empresas.csv', mimeType: 'text/csv', buffer: csv });
        await clickRole(page, 'button', /^Importar empresas$/);
        await page.getByText('Resumo da importação').waitFor({ timeout: 10000 });
      },
    },
  );
  await shoot(
    owner,
    '/empresas/importar',
    'relatorio',
    'após confirmar, volta para /empresas com as importadas e o aviso de convites',
    {
      interact: async (page) => {
        await page
          .locator('input[type="file"]')
          .first()
          .setInputFiles({ name: 'empresas.csv', mimeType: 'text/csv', buffer: csv });
        await clickRole(page, 'button', /^Importar empresas$/);
        await page.getByText('Resumo da importação').waitFor({ timeout: 10000 });
        await clickRole(page, 'button', /^Importar \d/);
        await page.waitForTimeout(2000);
      },
    },
  );
  await shoot(owner, '/templates', 'com-dados', 'templates do produto e o derivado');
  await shoot(
    owner,
    `/templates/${productTemplate.id}`,
    'produto',
    'template do produto somente leitura, ação de derivar',
    { slug: 'templates-id' },
  );
  await shoot(
    owner,
    `/templates/${derived.id}`,
    'derivado-em-edicao',
    'derivado com um item em edição',
    {
      slug: 'templates-id',
      interact: async (page) => {
        const editable = page.locator('main input, main select').first();
        await editable.click();
        if ((await editable.evaluate((el) => el.tagName)) === 'INPUT') {
          await editable.fill('Modelo do escritório (editado)');
        }
      },
    },
  );
  await shoot(owner, `/templates/${derived.id}`, 'dialogo-sair', 'diálogo "sair sem salvar"', {
    slug: 'templates-id',
    interact: async (page, viewport) => {
      await page.locator('main input[type="number"]').first().fill('20');
      await openMobileMenu(page, viewport);
      await clickRole(page, 'link', /^Checklists$/);
      await page.getByRole('button', { name: 'Sair e descartar' }).waitFor({ timeout: 5000 });
    },
  });
  await shoot(
    owner,
    '/mensagens',
    'sem-filtro',
    'log com data, Empresa, tipo, canal, destinatário, status',
  );
  await shoot(owner, '/mensagens', 'com-filtro', 'filtros de Empresa e canal aplicados', {
    interact: async (page) => {
      await page.getByLabel('Empresa').selectOption({ label: 'Mercado Bom Preço' });
      await page.getByLabel('Canal').selectOption({ index: 1 });
    },
  });
  await shoot(
    owner,
    '/mensagens',
    'linha-com-erro',
    'pílula de falha com o texto do erro abaixo e ação de reenviar',
  );
  await shoot(
    owner,
    '/configuracoes/contabilidade',
    'dono',
    'dados da Contabilidade editáveis e lembretes',
  );
  await shoot(owner, '/configuracoes/contadores', 'convite-pendente', 'equipe e convite pendente');
  await shoot(owner, '/configuracoes/contadores', 'form-convite', 'formulário de convite aberto', {
    interact: async (page) => clickRole(page, 'button', /Convidar/),
  });
  await shoot(owner, '/configuracoes/whatsapp', 'dono', 'status e ação de conectar');
  await shoot(owner, '/configuracoes/plano', 'trial', 'trial ativo, ciclo e planos');
  await shoot(
    owner,
    '/configuracoes/plano?plano=essencial',
    'plano-essencial',
    'plano pré-selecionado pela URL',
    {
      slug: 'configuracoes-plano',
    },
  );

  const member = await newContext();
  await call(member, 'POST', '/auth/sign-up', {
    ...MEMBER,
    password: PASSWORD,
    token: memberToken,
  });
  await signIn(member, MEMBER.email);
  await shoot(member, '/configuracoes/contabilidade', 'membro', 'somente leitura para membro');
  await shoot(member, '/configuracoes/plano', 'membro', 'somente leitura para membro');
  await shoot(member, '/configuracoes/whatsapp', 'membro', 'somente leitura para membro');

  const team = await call<{ id: string; email: string }[]>(owner, 'GET', '/accountants');
  const memberAccountant = team.find((accountant) => accountant.email === MEMBER.email);
  if (memberAccountant) {
    await call(owner, 'PATCH', `/companies/${twoContacts.id}`, {
      responsibleAccountantId: memberAccountant.id,
    });
  }
  await shoot(
    owner,
    `/competencias/${opening.id}/pendencias`,
    'filtro-contador',
    'filtro por contador aplicado',
    {
      slug: 'competencias-id-pendencias',
      interact: async (page) => {
        await page
          .locator('select')
          .filter({ hasText: 'Todos os contadores' })
          .selectOption({ label: MEMBER.name });
      },
    },
  );

  const contact = await newContext();
  const verify = await contact.request.get(magicLink, { maxRedirects: 0 }).catch(() => null);
  if (!verify) failures.push('magic link do Responsável não respondeu');
  await shoot(contact, '/minha-area/definir-senha', 'inicial', 'criar senha do Responsável');
  await shoot(
    contact,
    '/minha-area/pendencias',
    'com-pendencias',
    'itens agrupados por Empresa/Competência',
  );
  await shoot(contact, '/minha-area/competencias', 'lista', 'competências paginadas');
  await shoot(
    contact,
    '/minha-area/competencias',
    'periodo-expandido',
    'detalhe por Empresa expandido',
    {
      interact: async (page) => clickRole(page, 'button', /2026|Mercado|novembro|Ver/i),
    },
  );
  await shoot(
    contact,
    '/minha-area/competencias',
    'preview-aberto',
    'preview de documento aberto',
    {
      interact: async (page) => {
        await clickRole(page, 'button', /2026|Mercado|novembro|Ver/i);
        await page.waitForTimeout(500);
        await clickRole(page, 'button', /^Ver /);
        await page.waitForTimeout(1000);
      },
    },
  );

  await browser.close();

  writeFileSync(join(OUT, 'rows.json'), JSON.stringify({ rows, failures }, null, 2));
  console.log(`${rows.length} imagens, ${failures.length} falhas`);
  for (const failure of failures) console.log(`FALHA ${failure}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountant,
  accountingFirm,
  checklistTemplate,
  company,
  contact,
  subscription,
  user as authUser,
} from '../../src/infra/database/schema/index.js';
import { toFirmScope } from '../../src/modules/auth/scope.js';
import { ValidationError } from '../../src/lib/app-error.js';
import { CompaniesRepo } from '../../src/modules/companies/company.repo.js';

let seq = 0;

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedCompany = (
  firmId: string,
  name: string,
  opts: {
    active?: boolean;
    cnpj?: string;
    checklistTemplateId?: string;
    responsibleAccountantId?: string;
  } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(company)
      .values({
        accountingFirmId: firmId,
        name,
        active: opts.active ?? true,
        cnpj: opts.cnpj ?? null,
        checklistTemplateId: opts.checklistTemplateId ?? null,
        responsibleAccountantId: opts.responsibleAccountantId ?? null,
      })
      .returning({ id: company.id });

    return row.id;
  });

const seedCompanies = (firmId: string, prefix: string, total: number) =>
  Effect.promise(async () => {
    await db.insert(company).values(
      Array.from({ length: total }, (_, index) => ({
        accountingFirmId: firmId,
        name: `${prefix} ${String(index + 1).padStart(3, '0')}`,
      })),
    );
  });

const seedContact = (
  companyId: string,
  opts: { name?: string; email?: string; authUserId?: string } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(contact)
      .values({
        companyId,
        name: opts.name ?? `Resp ${++seq}`,
        email: opts.email ?? `resp-${seq}@example.com`,
        authUserId: opts.authUserId ?? null,
      })
      .returning({ id: contact.id });

    return row.id;
  });

const seedAuthUser = (email: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(authUser)
      .values({ name: 'Conta', email })
      .returning({ id: authUser.id });

    return row.id;
  });

const seedAccountant = (firmId: string, name: string, email: string) =>
  Effect.promise(async () => {
    const [accountRow] = await db
      .insert(authUser)
      .values({ name, email })
      .returning({ id: authUser.id });
    const [row] = await db
      .insert(accountant)
      .values({ accountingFirmId: firmId, authUserId: accountRow.id })
      .returning({ id: accountant.id });

    return row.id;
  });

const seedTemplate = (firmId: string | null, name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(checklistTemplate)
      .values({ accountingFirmId: firmId, name })
      .returning({ id: checklistTemplate.id });

    return row.id;
  });

const seedSubscription = (firmId: string, planName: string) =>
  Effect.promise(async () => {
    await db.insert(subscription).values({ accountingFirmId: firmId, planName });
  });

const CAP_EXCEEDED_18 =
  'Seu plano permite 15 empresas ativas e você já tem 18. ' +
  'Mude de plano em Plano e Assinatura para cadastrar mais.';

layer(CompaniesRepo.layer)('CompaniesRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('templateIsVisible enxerga template global e da própria firm, nunca de outra', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma T');
      const otherFirmId = yield* seedFirm('Firma T2');
      const globalId = yield* seedTemplate(null, 'Global T');
      const ownId = yield* seedTemplate(firmId, 'Próprio T');
      const foreignId = yield* seedTemplate(otherFirmId, 'Alheio T');

      expect(yield* repo.templateIsVisible(firmId, globalId)).toBe(true);
      expect(yield* repo.templateIsVisible(firmId, ownId)).toBe(true);
      expect(yield* repo.templateIsVisible(firmId, foreignId)).toBe(false);
    }),
  );

  it.effect('usage reporta plano, contagens, folga e recomendação de tier', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma U');
      yield* seedSubscription(firmId, 'essencial');
      yield* seedCompany(firmId, 'U Ativa 1');
      yield* seedCompany(firmId, 'U Ativa 2');
      yield* seedCompany(firmId, 'U Inativa', { active: false });

      expect(yield* repo.usage(firmId)).toEqual({
        planName: 'essencial',
        companiesActive: 2,
        companiesInactive: 1,
        companyCap: 30,
        softCap: 36,
        overCap: false,
        recommendedPlan: 'essencial',
      });
    }),
  );

  it.effect('create grava empresa e contato na mesma transação e recusa CNPJ duplicado', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma C');
      const accountantId = yield* seedAccountant(firmId, 'Contadora C', 'contadora-c@example.com');

      const created = yield* repo.create(firmId, {
        name: 'C Ltda',
        cnpj: '11222333000181',
        responsibleAccountantId: accountantId,
        flags: { has_employees: true },
        contact: { name: 'Resp C', email: 'resp-c@example.com' },
      });

      expect(created).toMatchObject({
        name: 'C Ltda',
        cnpj: '11222333000181',
        responsibleAccountantId: accountantId,
        flags: { has_employees: true },
        active: true,
      });
      expect(created.contacts).toMatchObject([{ name: 'Resp C', email: 'resp-c@example.com' }]);

      const dup = yield* repo
        .create(firmId, { name: 'C Clone', cnpj: '11222333000181', flags: {} })
        .pipe(Effect.flip);
      expect(dup).toBeInstanceOf(ValidationError);
      expect(dup).toMatchObject({ message: 'Já existe uma empresa com este CNPJ.' });
    }),
  );

  it.effect('teto (trial 15 + folga 18): create recusa, deactivate libera, reativação checa', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma Teto');
      yield* seedCompanies(firmId, 'Teto', 17);

      const last = yield* repo.create(firmId, { name: 'Teto 018', flags: {} });
      expect(last.active).toBe(true);

      const refused = yield* repo.create(firmId, { name: 'Teto 019', flags: {} }).pipe(Effect.flip);
      expect(refused).toBeInstanceOf(ValidationError);
      expect(refused).toMatchObject({ message: CAP_EXCEEDED_18 });

      const parked = yield* repo.deactivate(firmId, last.id);
      expect(parked).toMatchObject({ id: last.id, active: false });

      expect(yield* repo.update(firmId, last.id, { active: true })).toMatchObject({
        active: true,
      });

      const sleeping = yield* seedCompany(firmId, 'Teto Inativa', { active: false });
      const blocked = yield* repo.update(firmId, sleeping, { active: true }).pipe(Effect.flip);
      expect(blocked).toMatchObject({ message: CAP_EXCEEDED_18 });

      expect(yield* repo.update(firmId, last.id, { active: true })).toMatchObject({
        active: true,
      });
      expect(yield* repo.update(firmId, last.id, { name: 'Teto renomeada' })).toMatchObject({
        name: 'Teto renomeada',
      });
    }),
  );

  it.effect('list busca por nome e por dígitos do CNPJ, pagina e agrega contatos', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma L');
      const alfa = yield* seedCompany(firmId, 'Alfa Ltda', { cnpj: '11222333000181' });
      yield* seedCompany(firmId, 'Beta SA');
      yield* seedCompany(firmId, 'Gama ME', { active: false });
      const accountId = yield* seedAuthUser('resp-l1@example.com');
      yield* seedContact(alfa, { name: 'Ze', email: 'resp-l2@example.com' });
      yield* seedContact(alfa, {
        name: 'Ana',
        email: 'resp-l1@example.com',
        authUserId: accountId,
      });

      const byName = yield* repo.list(firmId, { search: 'alfa', page: 1, perPage: 10 });
      expect(byName.total).toBe(1);
      expect(byName.rows[0]).toMatchObject({
        name: 'Alfa Ltda',
        contactCount: 2,
        readyContactCount: 1,
      });
      expect(byName.rows[0].contacts.map((row) => row.name)).toEqual(['Ana', 'Ze']);

      const byCnpj = yield* repo.list(firmId, { search: '11.222-333', page: 1, perPage: 10 });
      expect(byCnpj.rows.map((row) => row.name)).toEqual(['Alfa Ltda']);

      const activeOnly = yield* repo.list(firmId, { active: true, page: 1, perPage: 1 });
      expect(activeOnly.total).toBe(2);
      expect(activeOnly.rows.map((row) => row.name)).toEqual(['Alfa Ltda']);

      const secondPage = yield* repo.list(firmId, { active: true, page: 2, perPage: 1 });
      expect(secondPage.rows.map((row) => row.name)).toEqual(['Beta SA']);

      const inactive = yield* repo.list(firmId, { active: false, page: 1, perPage: 10 });
      expect(inactive.rows.map((row) => row.name)).toEqual(['Gama ME']);
    }),
  );

  it.effect('findById devolve joins de template e responsável; undefined fora da firm', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma F');
      const otherFirmId = yield* seedFirm('Firma F2');
      const templateId = yield* seedTemplate(firmId, 'Modelo F');
      const accountantId = yield* seedAccountant(firmId, 'Contador F', 'contador-f@example.com');
      const companyId = yield* seedCompany(firmId, 'F Ltda', {
        checklistTemplateId: templateId,
        responsibleAccountantId: accountantId,
      });
      yield* seedContact(companyId, { name: 'Resp F', email: 'resp-f@example.com' });

      const found = yield* repo.findById(firmId, companyId);
      expect(found).toMatchObject({
        id: companyId,
        templateName: 'Modelo F',
        responsibleAccountantName: 'Contador F',
      });
      expect(found!.contacts).toMatchObject([
        { name: 'Resp F', email: 'resp-f@example.com', hasAccess: false },
      ]);

      expect(yield* repo.findById(otherFirmId, companyId)).toBeUndefined();
    }),
  );

  it.effect('update mescla flags parciais e recusa CNPJ de outra empresa da firm', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma M');
      const companyId = yield* seedCompany(firmId, 'M Ltda');

      yield* repo.update(firmId, companyId, { flags: { has_employees: true } });
      const merged = yield* repo.update(firmId, companyId, { flags: { has_inventory: true } });
      expect(merged!.flags).toEqual({ has_employees: true, has_inventory: true });

      yield* seedCompany(firmId, 'M Dona do CNPJ', { cnpj: '11444777000161' });
      const dup = yield* repo
        .update(firmId, companyId, { cnpj: '11444777000161' })
        .pipe(Effect.flip);
      expect(dup).toMatchObject({ message: 'Já existe uma empresa com este CNPJ.' });

      const ghost = '018f0000-0000-7000-8000-00000000dead';
      expect(yield* repo.update(firmId, ghost, { name: 'Nada' })).toBeUndefined();
    }),
  );

  it.effect('activateMany ativa até a folga em ordem de nome, pula o resto e explica', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma A');
      yield* seedCompanies(firmId, 'A Ativa', 16);
      const dormant: string[] = [];
      for (let index = 1; index <= 4; index++) {
        dormant.push(yield* seedCompany(firmId, `A Dormente ${index}`, { active: false }));
      }
      const otherFirmId = yield* seedFirm('Firma A2');
      const foreign = yield* seedCompany(otherFirmId, 'A Alheia', { active: false });

      const result = yield* repo.activateMany(firmId, [...dormant, foreign]);
      expect(result).toEqual({
        activated: 2,
        skipped: 2,
        companyCap: 15,
        softCap: 18,
        reason:
          '2 empresa(s) não entraram: seu plano cobre 15 ativas (com folga até 18) e você já tinha 16.',
      });

      const awakened = yield* Effect.promise(() =>
        db
          .select({ id: company.id, active: company.active })
          .from(company)
          .where(eq(company.accountingFirmId, firmId))
          .orderBy(company.name),
      );
      const dormantNow = awakened.filter((row) => dormant.includes(row.id));
      expect(dormantNow.map((row) => row.active)).toEqual([true, true, false, false]);

      const [foreignRow] = yield* Effect.promise(() =>
        db.select({ active: company.active }).from(company).where(eq(company.id, foreign)),
      );
      expect(foreignRow.active, 'empresa de outra firm não ativa').toBe(false);

      expect(yield* repo.activateMany(firmId, [foreign])).toEqual({
        activated: 0,
        skipped: 0,
        companyCap: 15,
        softCap: 18,
        reason: undefined,
      });
    }),
  );

  it.effect('contatos: add/update/delete/list e findOwnedId respeitam o escopo da firm', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma R');
      const otherFirmId = yield* seedFirm('Firma R2');
      const companyId = yield* seedCompany(firmId, 'R Ltda');

      expect(yield* repo.findOwnedId(firmId, companyId)).toBe(companyId);
      expect(yield* repo.findOwnedId(otherFirmId, companyId)).toBeUndefined();

      expect(
        yield* repo.addContact(otherFirmId, companyId, {
          name: 'Intruso',
          email: 'intruso@example.com',
        }),
      ).toBeUndefined();

      const added = yield* repo.addContact(firmId, companyId, {
        name: 'Resp R',
        email: 'resp-r@example.com',
        phone: '11999990000',
      });
      expect(added).toMatchObject({
        companyId,
        name: 'Resp R',
        email: 'resp-r@example.com',
        phone: '11999990000',
      });

      const edited = yield* repo.updateContact(firmId, companyId, added!.id, { name: 'Resp R2' });
      expect(edited?.row).toMatchObject({ id: added!.id, name: 'Resp R2' });
      // o e-mail anterior volta junto: trocá-lo é trocar a pessoa, e quem chama revoga
      expect(edited?.previousEmail).toBe(added!.email);
      expect(
        yield* repo.updateContact(otherFirmId, companyId, added!.id, { name: 'X' }),
      ).toBeUndefined();

      const accountId = yield* seedAuthUser('resp-com-conta@example.com');
      yield* seedContact(companyId, {
        name: 'Com Conta',
        email: 'resp-com-conta@example.com',
        authUserId: accountId,
      });

      const listed = yield* repo.listContacts(firmId, companyId);
      expect(listed).toHaveLength(2);
      expect(listed.map((row) => [row.name, row.hasAccess])).toEqual(
        expect.arrayContaining([
          ['Resp R2', false],
          ['Com Conta', true],
        ]),
      );
      expect(yield* repo.listContacts(otherFirmId, companyId)).toEqual([]);

      expect(yield* repo.deleteContact(otherFirmId, companyId, added!.id)).toBeUndefined();
      expect(yield* repo.deleteContact(firmId, companyId, added!.id)).toEqual({ id: added!.id });
      expect(yield* repo.listContacts(firmId, companyId)).toHaveLength(1);
    }),
  );

  it.effect('validateCsv monta a prévia por linha sem gravar nada', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const csv = [
        'name,cnpj,contact_name,contact_email,flag_has_employees',
        'Boa Ltda,11.222.333/0001-81,Resp Bom,resp-bom@example.com,sim',
        'Email Ruim,,Resp Ruim,nao-e-email,',
        'Duplicada,11222333000181,,,',
        ',,,resp-sem-nome@example.com,',
      ].join('\n');

      const preview = yield* repo.validateCsv(csv);
      expect(preview.total).toBe(4);
      expect(preview.failed).toBe(3);
      expect(preview.lines[0]).toMatchObject({
        line: 2,
        status: 'pending',
        name: 'Boa Ltda',
        body: {
          name: 'Boa Ltda',
          cnpj: '11222333000181',
          flags: { has_employees: true },
          contact: { name: 'Resp Bom', email: 'resp-bom@example.com' },
        },
      });
      expect(preview.lines[1]).toMatchObject({
        line: 3,
        status: 'error',
        error: 'contact.email: E-mail inválido.',
      });
      expect(preview.lines[2]).toMatchObject({
        line: 4,
        status: 'error',
        error: 'CNPJ repetido na planilha (já aparece na linha 2).',
      });
      expect(preview.lines[3]).toMatchObject({
        line: 5,
        status: 'error',
        error: 'name: Informe o nome da Empresa.',
      });

      const companies = yield* Effect.promise(() =>
        db.select({ id: company.id }).from(company).where(eq(company.name, 'Boa Ltda')),
      );
      expect(companies, 'prévia não grava nada').toEqual([]);

      const over = yield* repo
        .validateCsv(
          ['name', ...Array.from({ length: 1001 }, (_, index) => `Empresa ${index + 1}`)].join(
            '\n',
          ),
        )
        .pipe(Effect.flip);
      expect(over).toMatchObject({
        message: 'A planilha tem 1001 linhas; o limite por importação é 1000. Divida em lotes.',
      });
    }),
  );

  it.effect(
    'confirmImport: upsert por CNPJ não ocupa vaga nem mexe no active; vaga vai por linha',
    () =>
      Effect.gen(function* () {
        const repo = yield* CompaniesRepo;
        const firmId = yield* seedFirm('Firma I');
        yield* seedCompanies(firmId, 'I Ativa', 17);
        yield* seedCompany(firmId, 'I Estacionada', { active: false, cnpj: '00000000000191' });

        const result = yield* repo.confirmImport(firmId, [
          { line: 2, body: { name: 'I Estacionada Renomeada', cnpj: '00000000000191', flags: {} } },
          {
            line: 3,
            body: {
              name: 'I Nova',
              cnpj: '00000000000272',
              flags: {},
              contact: { name: 'Resp I', email: 'resp-i@example.com' },
            },
          },
          { line: 4, body: { name: 'I Sem CNPJ', flags: {} } },
        ]);

        expect(result).toMatchObject({ total: 3, created: 2, updated: 1, activated: 1, failed: 0 });
        expect(result.lines).toMatchObject([
          {
            line: 2,
            status: 'created',
            name: 'I Estacionada Renomeada',
            active: false,
            inserted: false,
          },
          { line: 3, status: 'created', name: 'I Nova', active: true, inserted: true },
          { line: 4, status: 'created', name: 'I Sem CNPJ', active: false, inserted: true },
        ]);

        const resent = yield* repo.confirmImport(firmId, [
          {
            line: 2,
            body: {
              name: 'I Nova v2',
              cnpj: '00000000000272',
              flags: {},
              contact: { name: 'Resp I v2', email: 'resp-i@example.com', phone: '11888887777' },
            },
          },
        ]);
        // já existia e já estava ativa: atualizada, não nova nem ativada de novo
        expect(resent).toMatchObject({ total: 1, created: 0, updated: 1, activated: 0 });

        const freshRows = yield* Effect.promise(() =>
          db
            .select({ id: company.id, name: company.name, active: company.active })
            .from(company)
            .where(eq(company.cnpj, '00000000000272')),
        );
        expect(freshRows, 'reenvio não duplica').toHaveLength(1);
        expect(freshRows[0]).toMatchObject({ name: 'I Nova v2', active: true });

        const contactRows = yield* Effect.promise(() =>
          db
            .select({ name: contact.name, phone: contact.phone })
            .from(contact)
            .where(eq(contact.companyId, freshRows[0].id)),
        );
        expect(contactRows, 'contato faz upsert por email').toEqual([
          { name: 'Resp I v2', phone: '11888887777' },
        ]);
      }),
  );

  it.effect('confirmImport: CNPJ repetido no lote, limite de linhas, activate=false e falha', () =>
    Effect.gen(function* () {
      const repo = yield* CompaniesRepo;
      const firmId = yield* seedFirm('Firma I2');

      expect(yield* repo.confirmImport(firmId, [])).toEqual({
        total: 0,
        created: 0,
        updated: 0,
        activated: 0,
        failed: 0,
        lines: [],
      });

      const dup = yield* repo
        .confirmImport(firmId, [
          { line: 2, body: { name: 'Dup 1', cnpj: '00000000000353', flags: {} } },
          { line: 3, body: { name: 'Dup 2', cnpj: '00000000000353', flags: {} } },
        ])
        .pipe(Effect.flip);
      expect(dup).toMatchObject({ message: 'A planilha tem o mesmo CNPJ em mais de uma linha.' });

      const over = yield* repo
        .confirmImport(
          firmId,
          Array.from({ length: 1001 }, (_, index) => ({
            line: index + 2,
            body: { name: `Lote ${index + 1}`, flags: {} },
          })),
        )
        .pipe(Effect.flip);
      expect(over).toMatchObject({ message: 'Limite de 1000 linhas por importação.' });

      const parked = yield* repo.confirmImport(
        firmId,
        [{ line: 2, body: { name: 'I2 Desativada', flags: {} } }],
        false,
      );
      expect(parked).toMatchObject({ total: 1, created: 1, activated: 0 });
      expect(parked.lines[0]).toMatchObject({ name: 'I2 Desativada', active: false });

      const broken = yield* repo
        .confirmImport(firmId, [
          {
            line: 2,
            body: {
              name: 'I2 Quebrada',
              checklistTemplateId: '018f0000-0000-7000-8000-00000000dead',
              flags: {},
            },
          },
        ])
        .pipe(Effect.flip);
      expect(broken).toMatchObject({
        message: 'Nada foi importado — falha ao gravar os registros no banco.',
      });
    }),
  );
});

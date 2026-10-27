import { Cause, Context, Effect, Layer } from 'effect';
import { and, count, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  COMPANY_FLAGS,
  type CompanyFlags,
  CreateCompanyBody,
  type ContactBody,
  MAX_IMPORT_ROWS,
  planCompanyCap,
  planForCompanies,
  planSoftCap,
  type UpdateCompanyBody,
} from '@competa/contracts';
import * as z from 'zod';
import { ValidationError } from '../../lib/app-error.js';
import { Db, type Executor } from '../../infra/database/effect.js';
import { squashError, type UniqueViolation } from '../../infra/database/error.js';
import {
  accountant,
  checklistTemplate,
  company,
  contact,
  subscription,
  user,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';

import { parseCsvRecords } from './csv.js';

export type ImportLineResult =
  | { line: number; status: 'created'; companyId: string; name: string; active: boolean }
  | { line: number; status: 'error'; name: string; error: string };

export type PendingImportRow = { line: number; body: CreateCompanyBody };

export type ImportPreviewLine =
  | ({ line: number; status: 'pending'; name: string } & PendingImportRow)
  | { line: number; status: 'error'; name: string; error: string };

const cnpjTakenOrDie = (violation: UniqueViolation) =>
  violation.constraint === 'company_cnpj_uidx'
    ? Effect.fail(new ValidationError('Já existe uma empresa com este CNPJ.'))
    : Effect.die(violation.cause);

const make = Effect.gen(function* () {
  const db = yield* Db;

  /** Teto de Empresas do plano. Fica aqui, e não na rota, porque os dois caminhos de
   *  entrada (cadastro avulso e importação por planilha) passam por `create`/`confirmImport` —
   *  guardar só na rota deixaria a planilha furar o plano. Nunca bloqueia competência
   *  já aberta: o limite é só sobre ocupar vaga de Empresa ativa.
   *
   *  Conta só Empresa **ativa** (a métrica de cobrança da D17/D18): Empresa desativada
   *  ocupando vaga puniria justamente "importe a carteira inteira e ative aos poucos".
   *  Gaming conhecido e aceito: desativar/reativar em rodízio para caber no teto. O limite
   *  prático é que a Competência é única por Contabilidade e o fan-out roda uma vez, então
   *  uma competência nunca cobre mais Empresas que o teto. */
  const capacityOf = async (scope: FirmScope, executor: Executor) => {
    const [sub] = await executor
      .select({ planName: subscription.planName })
      .from(subscription)
      .where(eq(subscription.accountingFirmId, scope))
      .limit(1);

    const cap = planCompanyCap(sub?.planName ?? 'trial');

    const [{ value: current }] = await executor
      .select({ value: count() })
      .from(company)
      .where(and(eq(company.accountingFirmId, scope), eq(company.active, true)));

    /* Folga de 20% antes do muro (D18 §7): bater o teto no dia 5 travaria o mês do cliente.
     * Entre o teto e a folga o cadastro passa e a firm entra em excedente — o banner é o
     * prompt de upgrade. No limite da folga, recusa. */
    return { cap, current, limit: planSoftCap(cap) };
  };

  const capExceeded = (cap: number, current: number) =>
    `Seu plano permite ${cap} empresas ativas e você já tem ${current}. ` +
    'Mude de plano em Plano e Assinatura para cadastrar mais.';

  const assertCompanyCapacity = Effect.fnUntraced(function* (scope: FirmScope, adding: number) {
    const { cap, current, limit } = yield* db.use((d) => capacityOf(scope, d));

    if (current + adding > limit) {
      return yield* Effect.fail(new ValidationError(capExceeded(cap, current)));
    }
  });

  const templateIsVisible = Effect.fn('CompaniesRepo.templateIsVisible')(function* (
    scope: FirmScope,
    templateId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({ id: checklistTemplate.id })
        .from(checklistTemplate)
        .where(
          and(
            eq(checklistTemplate.id, templateId),
            or(
              isNull(checklistTemplate.accountingFirmId),
              eq(checklistTemplate.accountingFirmId, scope),
            ),
          ),
        )
        .limit(1);

      return Boolean(row);
    });
  });

  /** Consumo do teto. Alimenta o banner de excedente e a recomendação de tier na tela de
   *  plano; a web invalida junto com a lista de Empresas (mesmo prefixo de chave). */
  const usage = Effect.fn('CompaniesRepo.usage')(function* (scope: FirmScope) {
    return yield* db.use(async (d) => {
      const [sub] = await d
        .select({ planName: subscription.planName })
        .from(subscription)
        .where(eq(subscription.accountingFirmId, scope))
        .limit(1);

      const [{ value: companiesInactive }] = await d
        .select({ value: count() })
        .from(company)
        .where(and(eq(company.accountingFirmId, scope), eq(company.active, false)));

      const { cap, current, limit } = await capacityOf(scope, d);

      return {
        planName: sub?.planName ?? 'trial',
        companiesActive: current,
        companiesInactive,
        companyCap: cap,
        softCap: limit,
        overCap: current > cap,
        recommendedPlan: planForCompanies(current),
      };
    });
  });

  const create = Effect.fn('CompaniesRepo.create')(function* (
    scope: FirmScope,
    body: CreateCompanyBody,
  ) {
    return yield* db
      .withTransaction(
        Effect.gen(function* () {
          const { cap, current, limit } = yield* db.use((tx) => capacityOf(scope, tx));
          if (current + 1 > limit) return yield* new ValidationError(capExceeded(cap, current));

          const [row] = yield* db.attempt((tx) =>
            tx
              .insert(company)
              .values({
                accountingFirmId: scope,
                checklistTemplateId: body.checklistTemplateId ?? null,
                responsibleAccountantId: body.responsibleAccountantId ?? null,
                name: body.name,
                cnpj: body.cnpj ?? null,
                flags: body.flags,
              })
              .returning(),
          );

          const contacts = body.contact
            ? yield* db.use((tx) =>
                tx
                  .insert(contact)
                  .values({ ...body.contact!, companyId: row.id })
                  .returning(),
              )
            : [];

          return { ...row, contacts };
        }),
      )
      .pipe(Effect.catchTag('UniqueViolation', cnpjTakenOrDie));
  });

  const list = Effect.fn('CompaniesRepo.list')(function* (
    scope: FirmScope,
    query: { active?: boolean; search?: string; page: number; perPage: number },
  ) {
    const searchTrimmed = query.search?.trim();
    const cleanDigits = searchTrimmed ? searchTrimmed.replace(/\D/g, '') : '';
    const searchFilter = searchTrimmed
      ? or(
          ilike(company.name, `%${searchTrimmed}%`),
          cleanDigits ? ilike(company.cnpj, `%${cleanDigits}%`) : undefined,
        )
      : undefined;

    const where = and(
      eq(company.accountingFirmId, scope),
      query.active === undefined ? undefined : eq(company.active, query.active),
      searchFilter,
    );

    return yield* db.use(async (d) => {
      const [rows, [total]] = await Promise.all([
        d
          .select({
            id: company.id,
            name: company.name,
            cnpj: company.cnpj,
            flags: company.flags,
            active: company.active,
            checklistTemplateId: company.checklistTemplateId,
            templateName: checklistTemplate.name,
            responsibleAccountantId: company.responsibleAccountantId,
            responsibleAccountantName: user.name,
            contactCount: d.$count(contact, eq(contact.companyId, company.id)),
            /** Responsáveis que ativaram a conta. Não é pré-requisito de nada (D14) — é o
             *  que a lista usa para oferecer "Convidar para o app" a quem ainda não usa. */
            readyContactCount: d.$count(
              contact,
              and(eq(contact.companyId, company.id), isNotNull(contact.authUserId)),
            ),
          })
          .from(company)
          .leftJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
          .leftJoin(
            accountant,
            and(
              eq(accountant.id, company.responsibleAccountantId),
              eq(accountant.accountingFirmId, company.accountingFirmId),
            ),
          )
          .leftJoin(user, eq(user.id, accountant.authUserId))
          .where(where)
          .orderBy(company.name)
          .limit(query.perPage)
          .offset((query.page - 1) * query.perPage),
        d.select({ value: count() }).from(company).where(where),
      ]);

      /** Quem recebe o email da abertura. Vai junto da lista (uma consulta a mais, não uma
       *  por empresa) porque o passo de confirmação da abertura precisa mostrar nome e
       *  email de cada Responsável antes de disparar N emails. */
      const companyIds = rows.map((row) => row.id);
      const contacts = companyIds.length
        ? await d
            .select({
              companyId: contact.companyId,
              id: contact.id,
              name: contact.name,
              email: contact.email,
            })
            .from(contact)
            .where(inArray(contact.companyId, companyIds))
            .orderBy(contact.name)
        : [];

      return {
        rows: rows.map((row) => ({
          ...row,
          contacts: contacts
            .filter((row_) => row_.companyId === row.id)
            .map(({ id, name, email }) => ({ id, name, email })),
        })),
        total: total.value,
      };
    });
  });

  const listContactsOf = (d: Executor, scope: FirmScope, companyId: string) =>
    d
      .select({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        /** `true` = ativou a conta. Conta é opcional: envia pelo Link com ou sem ela. */
        hasAccess: isNotNull(contact.authUserId),
      })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(and(eq(contact.companyId, companyId), eq(company.accountingFirmId, scope)));

  const findById = Effect.fn('CompaniesRepo.findById')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({
          id: company.id,
          name: company.name,
          cnpj: company.cnpj,
          flags: company.flags,
          active: company.active,
          checklistTemplateId: company.checklistTemplateId,
          templateName: checklistTemplate.name,
          responsibleAccountantId: company.responsibleAccountantId,
          responsibleAccountantName: user.name,
        })
        .from(company)
        .leftJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
        .leftJoin(
          accountant,
          and(
            eq(accountant.id, company.responsibleAccountantId),
            eq(accountant.accountingFirmId, company.accountingFirmId),
          ),
        )
        .leftJoin(user, eq(user.id, accountant.authUserId))
        .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
        .limit(1);

      if (!row) return undefined;

      return { ...row, contacts: await listContactsOf(d, scope, companyId) };
    });
  });

  const update = Effect.fn('CompaniesRepo.update')(function* (
    scope: FirmScope,
    companyId: string,
    body: UpdateCompanyBody,
  ) {
    /* Reativar ocupa vaga igual a cadastrar. Só a transição `false → true` custa a query de
     * teto — PATCH de nome ou template numa Empresa já ativa não pode pagar por isso. */
    if (body.active === true) {
      const [current] = yield* db.use((d) =>
        d
          .select({ active: company.active })
          .from(company)
          .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
          .limit(1),
      );

      if (current && !current.active) yield* assertCompanyCapacity(scope, 1);
    }

    // PATCH parcial de `flags` MESCLA: mandar uma flag não pode apagar as outras.
    const values = body.flags
      ? { ...body, flags: sql`${company.flags} || ${JSON.stringify(body.flags)}::jsonb` }
      : body;

    return yield* db
      .attempt(async (d) => {
        const [row] = await d
          .update(company)
          .set(values)
          .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
          .returning();

        return row;
      })
      .pipe(Effect.catchTag('UniqueViolation', cnpjTakenOrDie));
  });

  const deactivate = (scope: FirmScope, companyId: string) =>
    update(scope, companyId, { active: false });

  /** Ativação em lote: ativa quantas couberem na folga do teto e diz quantas ficaram de
   *  fora. Erro no lote inteiro seria pior — o Contador só quer saber onde parou. */
  const activateMany = Effect.fn('CompaniesRepo.activateMany')(function* (
    scope: FirmScope,
    companyIds: string[],
  ) {
    return yield* db.use(async (d) => {
      const inactive = await d
        .select({ id: company.id, name: company.name })
        .from(company)
        .where(
          and(
            eq(company.accountingFirmId, scope),
            eq(company.active, false),
            inArray(company.id, companyIds),
          ),
        )
        .orderBy(company.name);

      const { cap, current, limit } = await capacityOf(scope, d);
      const slots = Math.max(0, limit - current);
      const fitting = inactive.slice(0, slots);

      if (fitting.length) {
        await d
          .update(company)
          .set({ active: true })
          .where(
            and(
              eq(company.accountingFirmId, scope),
              inArray(
                company.id,
                fitting.map((row) => row.id),
              ),
            ),
          );
      }

      const skipped = inactive.length - fitting.length;

      return {
        activated: fitting.length,
        skipped,
        companyCap: cap,
        softCap: limit,
        reason: skipped
          ? `${skipped} empresa(s) não entraram: seu plano cobre ${cap} ativas (com folga até ${limit}) e você já tinha ${current}.`
          : undefined,
      };
    });
  });

  const listContacts = Effect.fn('CompaniesRepo.listContacts')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use((d) => listContactsOf(d, scope, companyId));
  });

  const findOwnedIdOf = async (d: Executor, scope: FirmScope, companyId: string) => {
    const [row] = await d
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .limit(1);

    return row?.id;
  };

  const addContact = Effect.fn('CompaniesRepo.addContact')(function* (
    scope: FirmScope,
    companyId: string,
    body: ContactBody,
  ) {
    return yield* db.use(async (d) => {
      const owned = await findOwnedIdOf(d, scope, companyId);
      if (!owned) return undefined;

      const [row] = await d
        .insert(contact)
        .values({ ...body, companyId: owned })
        .returning();

      return row;
    });
  });

  const updateContact = Effect.fn('CompaniesRepo.updateContact')(function* (
    scope: FirmScope,
    companyId: string,
    contactId: string,
    body: Partial<ContactBody>,
  ) {
    return yield* db.use(async (d) => {
      const owned = await findOwnedIdOf(d, scope, companyId);
      if (!owned) return undefined;

      /* O e-mail ANTERIOR volta junto porque trocá-lo é trocar a pessoa: quem chama precisa
       * saber disso para revogar o acesso do antigo Responsável. */
      const [before] = await d
        .select({ email: contact.email })
        .from(contact)
        .where(and(eq(contact.id, contactId), eq(contact.companyId, owned)))
        .limit(1);

      const [row] = await d
        .update(contact)
        .set(body)
        .where(and(eq(contact.id, contactId), eq(contact.companyId, owned)))
        .returning();

      return row && { row, previousEmail: before?.email };
    });
  });

  const deleteContact = Effect.fn('CompaniesRepo.deleteContact')(function* (
    scope: FirmScope,
    companyId: string,
    contactId: string,
  ) {
    return yield* db.use(async (d) => {
      const owned = await findOwnedIdOf(d, scope, companyId);
      if (!owned) return undefined;

      const [row] = await d
        .delete(contact)
        .where(and(eq(contact.id, contactId), eq(contact.companyId, owned)))
        .returning({ id: contact.id });

      return row;
    });
  });

  const findOwnedId = Effect.fn('CompaniesRepo.findOwnedId')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use((d) => findOwnedIdOf(d, scope, companyId));
  });

  /** Só valida e monta a prévia — nada é gravado ainda. Gravar já na validação criava
   *  empresa antes do Contador confirmar: reenviar a planilha depois de corrigir outras
   *  linhas duplicava quem já tinha dado certo. Agora só entra no banco em `confirmImport`,
   *  quando o Contador confirma de fato (ao enviar convite ou ao concluir). */
  const validateCsv = Effect.fn('CompaniesRepo.validateCsv')(function* (csv: string) {
    const records = parseCsvRecords(csv);

    if (records.length > MAX_IMPORT_ROWS) {
      return yield* Effect.fail(
        new ValidationError(
          `A planilha tem ${records.length} linhas; o limite por importação é ${MAX_IMPORT_ROWS}. Divida em lotes.`,
        ),
      );
    }

    const lines: ImportPreviewLine[] = [];
    /* CNPJ repetido DENTRO do mesmo lote batia duas vezes no `onConflictDoUpdate` da mesma
     * statement — Postgres 21000, planilha inteira abortada e mensagem que não dizia qual
     * linha. Reprovar a segunda ocorrência aqui dá o número da linha ao Contador. */
    const seenCnpj = new Map<string, number>();

    for (const { line, values } of records) {
      const name = values.name ?? '';

      /* `!== undefined` pegava a coluna existir, não ela ter valor: planilha com coluna de
       * email vazia transformava TODA linha em erro "E-mail inválido". */
      const hasContact = Boolean(
        values.contact_email || values.contact_name || values.contact_phone,
      );

      const parsed = CreateCompanyBody.safeParse({
        name,
        cnpj: values.cnpj || undefined,
        flags: parseFlags(values),
        contact: hasContact
          ? {
              name: values.contact_name || name,
              email: values.contact_email ?? '',
              phone: values.contact_phone || undefined,
            }
          : undefined,
      });

      if (!parsed.success) {
        lines.push({ line, status: 'error', name, error: firstIssue(parsed.error) });
        continue;
      }

      const cnpj = parsed.data.cnpj;
      if (cnpj) {
        const first = seenCnpj.get(cnpj);
        if (first !== undefined) {
          lines.push({
            line,
            status: 'error',
            name,
            error: `CNPJ repetido na planilha (já aparece na linha ${first}).`,
          });
          continue;
        }
        seenCnpj.set(cnpj, line);
      }

      lines.push({ line, status: 'pending', name, body: parsed.data });
    }

    return {
      total: records.length,
      failed: lines.filter((row) => row.status === 'error').length,
      lines,
    };
  });

  /** `RETURNING` de um INSERT multi-linha devolve na ordem em que os valores foram dados —
   *  é o que casa cada id com a linha da planilha e com o Responsável dela. Empresa com
   *  CNPJ já cadastrado na mesma Contabilidade atualiza em vez de duplicar (reenvio da
   *  planilha depois de corrigir outras linhas não recria quem já tinha entrado). Linha
   *  sem CNPJ não tem chave pra deduplicar, então sempre insere. */
  const insertBatch = Effect.fn('CompaniesRepo.insertBatch')(function* (
    scope: FirmScope,
    pending: PendingImportRow[],
    activeByLine: Map<number, boolean>,
  ) {
    return yield* db
      .withTransaction(
        db.use(async (tx): Promise<ImportLineResult[]> => {
          const withCnpj = pending.filter(({ body }) => body.cnpj);
          const withoutCnpj = pending.filter(({ body }) => !body.cnpj);

          const upserted = withCnpj.length
            ? await tx
                .insert(company)
                .values(
                  withCnpj.map(({ line, body }) => ({
                    accountingFirmId: scope,
                    checklistTemplateId: body.checklistTemplateId ?? null,
                    responsibleAccountantId: body.responsibleAccountantId ?? null,
                    name: body.name,
                    cnpj: body.cnpj,
                    flags: body.flags,
                    active: activeByLine.get(line) ?? false,
                  })),
                )
                /* `active` fica FORA do `set`: reenviar a planilha não pode desativar quem o
                 * Contador já ativou na mão, nem reativar quem ele desativou. */
                .onConflictDoUpdate({
                  target: [company.accountingFirmId, company.cnpj],
                  targetWhere: sql`${company.cnpj} is not null`,
                  set: {
                    name: sql`excluded.name`,
                    checklistTemplateId: sql`excluded.checklist_template_id`,
                    /* Acompanha `name`/`flags` porque é coluna da planilha, não ajuste
                     * manual: o `active` é a exceção, e ela está dita acima. */
                    responsibleAccountantId: sql`excluded.responsible_accountant_id`,
                    flags: sql`excluded.flags`,
                  },
                })
                .returning({
                  id: company.id,
                  name: company.name,
                  cnpj: company.cnpj,
                  active: company.active,
                })
            : [];

          const inserted = withoutCnpj.length
            ? await tx
                .insert(company)
                .values(
                  withoutCnpj.map(({ line, body }) => ({
                    accountingFirmId: scope,
                    checklistTemplateId: body.checklistTemplateId ?? null,
                    responsibleAccountantId: body.responsibleAccountantId ?? null,
                    name: body.name,
                    cnpj: null,
                    flags: body.flags,
                    active: activeByLine.get(line) ?? false,
                  })),
                )
                .returning({ id: company.id, name: company.name, active: company.active })
            : [];

          const rowByLine = new Map<number, { id: string; name: string; active: boolean }>();
          const companyByCnpj = new Map(upserted.map((row) => [row.cnpj!, row]));
          withCnpj.forEach(({ line, body }) => {
            const matched = companyByCnpj.get(body.cnpj!);
            if (matched) rowByLine.set(line, matched);
          });
          withoutCnpj.forEach(({ line }, index) => rowByLine.set(line, inserted[index]));

          const contacts = pending.flatMap(({ line, body }) =>
            body.contact && rowByLine.has(line)
              ? [{ ...body.contact, companyId: rowByLine.get(line)!.id }]
              : [],
          );

          if (contacts.length) {
            const companyIds = [...new Set(contacts.map((c) => c.companyId))];
            const existingContacts = await tx
              .select({ id: contact.id, companyId: contact.companyId, email: contact.email })
              .from(contact)
              .where(inArray(contact.companyId, companyIds));

            const existingByCompanyEmail = new Set(
              existingContacts.map((c) => `${c.companyId}:${c.email.toLowerCase()}`),
            );

            for (const c of contacts) {
              const key = `${c.companyId}:${c.email.toLowerCase()}`;
              if (existingByCompanyEmail.has(key)) {
                await tx
                  .update(contact)
                  .set({ name: c.name, phone: c.phone ?? null })
                  .where(and(eq(contact.companyId, c.companyId), eq(contact.email, c.email)));
              } else {
                await tx.insert(contact).values(c);
                existingByCompanyEmail.add(key);
              }
            }
          }

          return pending.map(({ line }) => {
            const row = rowByLine.get(line)!;
            return {
              line,
              status: 'created' as const,
              companyId: row.id,
              name: row.name,
              active: row.active,
            };
          });
        }),
      )
      .pipe(
        /* Qualquer falha ao gravar (banco fora, constraint, erro do driver) desfaz o lote
         * inteiro e vira o mesmo 422 — só a interrupção segue como interrupção. */
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.interrupt
            : Effect.gen(function* () {
                yield* Effect.logError(
                  'Falha ao gravar registros de importação',
                  squashError(cause),
                );
                return yield* Effect.fail(
                  new ValidationError(
                    'Nada foi importado — falha ao gravar os registros no banco.',
                  ),
                );
              }),
        ),
      );
  });

  /** Uma transação para a importação inteira, com os dois inserts em lote. Antes era um
   *  `create()` por linha, fora de transação: 40 mil linhas de um corpo de 2 MB rodavam por
   *  minutos, o timeout cortava no meio e o tenant ficava com meia carteira dentro, sem
   *  rollback e sem relatório. Agora ou entra tudo, ou não entra nada — e o relatório por
   *  linha continua saindo, porque a validação já aconteceu em `validateCsv`, antes de
   *  chegar aqui. */
  const confirmImport = Effect.fn('CompaniesRepo.confirmImport')(function* (
    scope: FirmScope,
    pending: PendingImportRow[],
    activate = true,
  ) {
    if (pending.length > MAX_IMPORT_ROWS) {
      return yield* Effect.fail(
        new ValidationError(`Limite de ${MAX_IMPORT_ROWS} linhas por importação.`),
      );
    }

    /* `pending` é corpo do cliente: a prévia pode ser pulada, então o lote chega aqui sem
     * ter passado por `validateCsv`. */
    const cnpjs = pending
      .map(({ body }) => body.cnpj)
      .filter((cnpj): cnpj is string => Boolean(cnpj));
    if (new Set(cnpjs).size !== cnpjs.length) {
      return yield* Effect.fail(
        new ValidationError('A planilha tem o mesmo CNPJ em mais de uma linha.'),
      );
    }

    /* A planilha faz upsert por CNPJ: reenvio de quem já está cadastrado não ocupa vaga
     * nova, então só as linhas que realmente entram contam contra o teto do plano. */
    const existing = cnpjs.length
      ? yield* db.use((d) =>
          d
            .select({ cnpj: company.cnpj })
            .from(company)
            .where(and(eq(company.accountingFirmId, scope), inArray(company.cnpj, cnpjs))),
        )
      : [];
    const known = new Set(existing.map((row) => row.cnpj));
    const adding = pending.filter(({ body }) => !body.cnpj || !known.has(body.cnpj));

    /* Importar a carteira inteira NUNCA é recusado por teto: as linhas que não couberem
     * entram desativadas, e o Contador ativa quando quiser. Recusar aqui era pedir que o
     * cliente se auto-promovesse de tier só para cadastrar quem ele ainda nem usa. */
    const { current, limit } = yield* db.use((d) => capacityOf(scope, d));
    const slots = activate ? Math.max(0, limit - current) : 0;

    const activeByLine = new Map(adding.map(({ line }, index) => [line, index < slots] as const));

    const created = pending.length ? yield* insertBatch(scope, pending, activeByLine) : [];

    return {
      total: pending.length,
      created: created.length,
      activated: created.filter((row) => row.status === 'created' && row.active).length,
      failed: 0,
      lines: created,
    };
  });

  return {
    templateIsVisible,
    usage,
    create,
    list,
    findById,
    update,
    deactivate,
    activateMany,
    listContacts,
    addContact,
    updateContact,
    deleteContact,
    findOwnedId,
    validateCsv,
    confirmImport,
  };
});

export class CompaniesRepo extends Context.Service<CompaniesRepo, Effect.Success<typeof make>>()(
  'competa/api/companies/CompaniesRepo',
) {
  static readonly layerNoDeps = Layer.effect(CompaniesRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}

const TRUTHY_FLAG_VALUES = new Set(['sim', 's', 'true', 'verdadeiro', '1']);

const parseFlags = (values: Record<string, string | undefined>): CompanyFlags =>
  Object.fromEntries(
    COMPANY_FLAGS.filter((flag) =>
      TRUTHY_FLAG_VALUES.has((values[`flag_${flag}`] ?? '').trim().toLowerCase()),
    ).map((flag) => [flag, true]),
  );

const firstIssue = (error: z.ZodError) => {
  const issue = error.issues[0];

  return `${issue.path.join('.') || 'linha'}: ${issue.message}`;
};

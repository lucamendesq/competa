import { Injectable, Logger } from '@nestjs/common';
import { and, count, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  COMPANY_FLAGS,
  type CompanyFlags,
  CreateCompanyBody,
  type ContactBody,
  MAX_IMPORT_ROWS,
  type UpdateCompanyBody,
} from '@competa/contracts';
import * as z from 'zod';
import { ValidationError } from '../../lib/app-error.js';
import { Database } from '../../infra/database/database.js';
import {
  accountant,
  checklistTemplate,
  company,
  contact,
  user,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';

import { parseCsvRecords } from './csv.js';

export type ImportLineResult =
  | { line: number; status: 'created'; companyId: string; name: string }
  | { line: number; status: 'error'; name: string; error: string };

export type PendingImportRow = { line: number; body: CreateCompanyBody };

export type ImportPreviewLine =
  | ({ line: number; status: 'pending'; name: string } & PendingImportRow)
  | { line: number; status: 'error'; name: string; error: string };

/** O driver embrulha o erro do Postgres; procuramos a constraint na cadeia de causas
 *  para devolver 409 de negócio em vez de 500 (mesmo padrão de period.repository.ts). */
const violatesCompanyCnpjUnique = (error: unknown): boolean => {
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
    const pg = cause as { constraint?: string; code?: string };
    if (pg.constraint === 'company_cnpj_uidx') return true;
    if (pg.code === '23505' && cause.message.includes('company_cnpj_uidx')) return true;
  }

  return false;
};

@Injectable()
export class CompanyRepository {
  private readonly logger = new Logger(CompanyRepository.name);

  constructor(private readonly db: Database) {}

  async templateIsVisible(scope: FirmScope, templateId: string) {
    const [row] = await this.db
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
  }

  async create(scope: FirmScope, body: CreateCompanyBody, tx: Database = this.db) {
    const run = async (executor: Database) => {
      const [row] = await executor
        .insert(company)
        .values({
          accountingFirmId: scope,
          checklistTemplateId: body.checklistTemplateId ?? null,
          responsibleAccountantId: body.responsibleAccountantId ?? null,
          name: body.name,
          cnpj: body.cnpj ?? null,
          flags: body.flags,
        })
        .returning();

      const contacts = body.contact
        ? await executor
            .insert(contact)
            .values({ ...body.contact, companyId: row.id })
            .returning()
        : [];

      return { ...row, contacts };
    };

    try {
      return await (tx === this.db ? this.db.transaction(run) : run(tx));
    } catch (error) {
      if (violatesCompanyCnpjUnique(error)) {
        throw new ValidationError('Já existe uma empresa com este CNPJ.');
      }
      throw error;
    }
  }

  async list(
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

    const [rows, [total]] = await Promise.all([
      this.db
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
          contactCount: this.db.$count(contact, eq(contact.companyId, company.id)),
          /** Responsáveis que ativaram a conta. Não é pré-requisito de nada (D14) — é o
           *  que a lista usa para oferecer "Convidar para o app" a quem ainda não usa. */
          readyContactCount: this.db.$count(
            contact,
            and(eq(contact.companyId, company.id), isNotNull(contact.authUserId)),
          ),
        })
        .from(company)
        .leftJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
        .leftJoin(accountant, eq(accountant.id, company.responsibleAccountantId))
        .leftJoin(user, eq(user.id, accountant.authUserId))
        .where(where)
        .orderBy(company.name)
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      this.db.select({ value: count() }).from(company).where(where),
    ]);

    /** Quem recebe o email da abertura. Vai junto da lista (uma consulta a mais, não uma
     *  por empresa) porque o passo de confirmação da abertura precisa mostrar nome e
     *  email de cada Responsável antes de disparar N emails. */
    const companyIds = rows.map((row) => row.id);
    const contacts = companyIds.length
      ? await this.db
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
  }

  async findById(scope: FirmScope, companyId: string) {
    const [row] = await this.db
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
      .leftJoin(accountant, eq(accountant.id, company.responsibleAccountantId))
      .leftJoin(user, eq(user.id, accountant.authUserId))
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;

    return { ...row, contacts: await this.listContacts(scope, companyId) };
  }

  async update(scope: FirmScope, companyId: string, body: UpdateCompanyBody) {
    // PATCH parcial de `flags` MESCLA: mandar uma flag não pode apagar as outras.
    const values = body.flags
      ? { ...body, flags: sql`${company.flags} || ${JSON.stringify(body.flags)}::jsonb` }
      : body;

    try {
      const [row] = await this.db
        .update(company)
        .set(values)
        .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
        .returning();

      return row;
    } catch (error) {
      if (violatesCompanyCnpjUnique(error)) {
        throw new ValidationError('Já existe uma empresa com este CNPJ.');
      }
      throw error;
    }
  }

  async deactivate(scope: FirmScope, companyId: string) {
    return this.update(scope, companyId, { active: false });
  }

  async listContacts(scope: FirmScope, companyId: string) {
    return this.db
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
  }

  async addContact(scope: FirmScope, companyId: string, body: ContactBody) {
    const owned = await this.findOwnedId(scope, companyId);
    if (!owned) return undefined;

    const [row] = await this.db
      .insert(contact)
      .values({ ...body, companyId: owned })
      .returning();

    return row;
  }

  async updateContact(
    scope: FirmScope,
    companyId: string,
    contactId: string,
    body: Partial<ContactBody>,
  ) {
    const owned = await this.findOwnedId(scope, companyId);
    if (!owned) return undefined;

    const [row] = await this.db
      .update(contact)
      .set(body)
      .where(and(eq(contact.id, contactId), eq(contact.companyId, owned)))
      .returning();

    return row;
  }

  async deleteContact(scope: FirmScope, companyId: string, contactId: string) {
    const owned = await this.findOwnedId(scope, companyId);
    if (!owned) return undefined;

    const [row] = await this.db
      .delete(contact)
      .where(and(eq(contact.id, contactId), eq(contact.companyId, owned)))
      .returning({ id: contact.id });

    return row;
  }

  async findOwnedId(scope: FirmScope, companyId: string) {
    const [row] = await this.db
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .limit(1);

    return row?.id;
  }

  /** Só valida e monta a prévia — nada é gravado ainda. Gravar já na validação criava
   *  empresa antes do Contador confirmar: reenviar a planilha depois de corrigir outras
   *  linhas duplicava quem já tinha dado certo. Agora só entra no banco em `confirmImport`,
   *  quando o Contador confirma de fato (ao enviar convite ou ao concluir). */
  validateCsv(csv: string) {
    const records = parseCsvRecords(csv);

    if (records.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(
        `A planilha tem ${records.length} linhas; o limite por importação é ${MAX_IMPORT_ROWS}. Divida em lotes.`,
      );
    }

    const lines: ImportPreviewLine[] = [];

    for (const { line, values } of records) {
      const name = values.name ?? '';

      const hasContact = Boolean(
        values.contact_email !== undefined || values.contact_name || values.contact_phone,
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

      lines.push({ line, status: 'pending', name, body: parsed.data });
    }

    return {
      total: records.length,
      failed: lines.filter((row) => row.status === 'error').length,
      lines,
    };
  }

  /** Uma transação para a importação inteira, com os dois inserts em lote. Antes era um
   *  `create()` por linha, fora de transação: 40 mil linhas de um corpo de 2 MB rodavam por
   *  minutos, o timeout cortava no meio e o tenant ficava com meia carteira dentro, sem
   *  rollback e sem relatório. Agora ou entra tudo, ou não entra nada — e o relatório por
   *  linha continua saindo, porque a validação já aconteceu em `validateCsv`, antes de
   *  chegar aqui. */
  async confirmImport(scope: FirmScope, pending: PendingImportRow[]) {
    if (pending.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(`Limite de ${MAX_IMPORT_ROWS} linhas por importação.`);
    }

    const created = pending.length ? await this.insertBatch(scope, pending) : [];

    return {
      total: pending.length,
      created: created.length,
      failed: 0,
      lines: created,
    };
  }

  /** `RETURNING` de um INSERT multi-linha devolve na ordem em que os valores foram dados —
   *  é o que casa cada id com a linha da planilha e com o Responsável dela. Empresa com
   *  CNPJ já cadastrado na mesma Contabilidade atualiza em vez de duplicar (reenvio da
   *  planilha depois de corrigir outras linhas não recria quem já tinha entrado). Linha
   *  sem CNPJ não tem chave pra deduplicar, então sempre insere. */
  private async insertBatch(
    scope: FirmScope,
    pending: PendingImportRow[],
  ): Promise<ImportLineResult[]> {
    try {
      return await this.db.transaction(async (tx) => {
        const withCnpj = pending.filter(({ body }) => body.cnpj);
        const withoutCnpj = pending.filter(({ body }) => !body.cnpj);

        const upserted = withCnpj.length
          ? await tx
              .insert(company)
              .values(
                withCnpj.map(({ body }) => ({
                  accountingFirmId: scope,
                  checklistTemplateId: body.checklistTemplateId ?? null,
                  name: body.name,
                  cnpj: body.cnpj,
                  flags: body.flags,
                })),
              )
              .onConflictDoUpdate({
                target: [company.accountingFirmId, company.cnpj],
                targetWhere: sql`${company.cnpj} is not null`,
                set: {
                  name: sql`excluded.name`,
                  checklistTemplateId: sql`excluded.checklist_template_id`,
                  flags: sql`excluded.flags`,
                },
              })
              .returning({ id: company.id, name: company.name, cnpj: company.cnpj })
          : [];

        const inserted = withoutCnpj.length
          ? await tx
              .insert(company)
              .values(
                withoutCnpj.map(({ body }) => ({
                  accountingFirmId: scope,
                  checklistTemplateId: body.checklistTemplateId ?? null,
                  name: body.name,
                  cnpj: null,
                  flags: body.flags,
                })),
              )
              .returning({ id: company.id, name: company.name })
          : [];

        const rowByLine = new Map<number, { id: string; name: string }>();
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
          return { line, status: 'created' as const, companyId: row.id, name: row.name };
        });
      });
    } catch (error) {
      this.logger.error('Falha ao gravar registros de importação', error);
      throw new ValidationError('Nada foi importado — falha ao gravar os registros no banco.');
    }
  }
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

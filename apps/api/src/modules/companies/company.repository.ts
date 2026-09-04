import { Injectable } from '@nestjs/common';
import { and, count, eq, isNull, or } from 'drizzle-orm';
import {
  COMPANY_FLAGS,
  type CompanyFlags,
  CreateCompanyBody,
  type ContactBody,
  type UpdateCompanyBody,
} from '@contabilidade/contracts';
import * as z from 'zod';
import { Database } from '../../infra/database/database.js';
import { checklistTemplate, company, contact } from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';
import { parseCsvRecords } from './csv.js';

export type ImportLineResult =
  | { line: number; status: 'created'; companyId: string; name: string }
  | { line: number; status: 'error'; name: string; error: string };

@Injectable()
export class CompanyRepository {
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
          checklistTemplateId: body.checklistTemplateId,
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

    return tx === this.db ? this.db.transaction(run) : run(tx);
  }

  async list(scope: FirmScope, query: { active?: boolean; page: number; perPage: number }) {
    const where = and(
      eq(company.accountingFirmId, scope),
      query.active === undefined ? undefined : eq(company.active, query.active),
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
          contactCount: this.db.$count(contact, eq(contact.companyId, company.id)),
        })
        .from(company)
        .innerJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
        .where(where)
        .orderBy(company.name)
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      this.db.select({ value: count() }).from(company).where(where),
    ]);

    return { rows, total: total.value };
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
      })
      .from(company)
      .innerJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;

    return { ...row, contacts: await this.listContacts(scope, companyId) };
  }

  async update(scope: FirmScope, companyId: string, body: UpdateCompanyBody) {
    const [row] = await this.db
      .update(company)
      .set(body)
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .returning();

    return row;
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

  async templatesByName(scope: FirmScope) {
    const rows = await this.db
      .select({ id: checklistTemplate.id, name: checklistTemplate.name })
      .from(checklistTemplate)
      .where(
        or(
          isNull(checklistTemplate.accountingFirmId),
          eq(checklistTemplate.accountingFirmId, scope),
        ),
      );

    return new Map(rows.map((row) => [row.name.trim().toLowerCase(), row.id]));
  }

  async importFromCsv(scope: FirmScope, csv: string) {
    const records = parseCsvRecords(csv);
    const templates = await this.templatesByName(scope);
    const results: ImportLineResult[] = [];

    for (const { line, values } of records) {
      const name = values.name ?? '';
      const templateId = templates.get((values.template ?? '').trim().toLowerCase());

      if (!templateId) {
        results.push({
          line,
          status: 'error',
          name,
          error: `Template "${values.template ?? ''}" não encontrado.`,
        });
        continue;
      }

      const parsed = CreateCompanyBody.safeParse({
        name,
        checklistTemplateId: templateId,
        cnpj: values.cnpj || undefined,
        flags: parseFlags(values.flags),
        contact: values.contact_email
          ? {
              name: values.contact_name || name,
              email: values.contact_email,
              phone: values.contact_phone || undefined,
            }
          : undefined,
      });

      if (!parsed.success) {
        results.push({ line, status: 'error', name, error: firstIssue(parsed.error) });
        continue;
      }

      try {
        const created = await this.create(scope, parsed.data);
        results.push({ line, status: 'created', companyId: created.id, name: created.name });
      } catch (error) {
        results.push({ line, status: 'error', name, error: describe(error) });
      }
    }

    return {
      total: records.length,
      created: results.filter((row) => row.status === 'created').length,
      failed: results.filter((row) => row.status === 'error').length,
      lines: results,
    };
  }
}

const parseFlags = (raw?: string): CompanyFlags => {
  const wanted = (raw ?? '')
    .split(/[|,;\s]+/)
    .map((flag) => flag.trim().toLowerCase())
    .filter(Boolean);

  return Object.fromEntries(
    COMPANY_FLAGS.filter((flag) => wanted.includes(flag)).map((flag) => [flag, true]),
  );
};

const firstIssue = (error: z.ZodError) => {
  const issue = error.issues[0];

  return `${issue.path.join('.') || 'linha'}: ${issue.message}`;
};

const describe = (error: unknown) =>
  error instanceof Error ? error.message : 'Falha ao gravar a Empresa.';

import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import {
  DOCUMENT_CATEGORIES,
  OVERRIDE_ACTIONS,
  PERIODICITIES,
  type CompanyFlags,
} from '@competa/contracts';
import { user } from './auth.js';
import { id, timestamps } from './columns.js';

const oneOf = (column: SQL, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;

export const accountingFirm = pgTable(
  'accounting_firm',
  {
    id: id(),
    name: text().notNull(),
    logoUrl: text('logo_url'),
    contactEmail: text('contact_email'),
    /** Preferências de lembrete (cadência do cron). Defaults = comportamento histórico. */
    reminderMax: smallint('reminder_max').notNull().default(2),
    reminderDueSoonDays: smallint('reminder_due_soon_days').notNull().default(3),
    reminderGapDays: smallint('reminder_gap_days').notNull().default(3),
    ...timestamps,
  },
  (t) => [
    check(
      'accounting_firm_reminder_chk',
      sql`${t.reminderMax} between 0 and 10
        and ${t.reminderDueSoonDays} between 0 and 31
        and ${t.reminderGapDays} between 1 and 31`,
    ),
  ],
).enableRLS();

export const accountant = pgTable(
  'accountant',
  {
    id: id(),
    accountingFirmId: uuid('accounting_firm_id')
      .notNull()
      .references(() => accountingFirm.id, { onDelete: 'cascade' }),
    authUserId: uuid('auth_user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    owner: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // uma Contabilidade tem no máximo um dono: quem arbitra é o banco, não a aplicação —
    // dois signups simultâneos no mesmo convite inicial passariam por uma checagem em JS
    uniqueIndex('accountant_owner_uidx')
      .on(t.accountingFirmId)
      .where(sql`${t.owner}`),
    index('accountant_firm_idx').on(t.accountingFirmId),
  ],
).enableRLS();

export const documentType = pgTable(
  'document_type',
  {
    id: id(),
    accountingFirmId: uuid('accounting_firm_id').references(() => accountingFirm.id),
    name: text().notNull(),
    category: text().notNull(),
    acceptedFormats: text('accepted_formats').array().notNull().default(['pdf']),
    description: text(),
    ...timestamps,
  },
  (t) => [
    check('document_type_category_chk', oneOf(sql`${t.category}`, DOCUMENT_CATEGORIES)),
    index('document_type_firm_idx').on(t.accountingFirmId),
  ],
).enableRLS();

export const checklistTemplate = pgTable(
  'checklist_template',
  {
    id: id(),
    accountingFirmId: uuid('accounting_firm_id').references(() => accountingFirm.id),
    name: text().notNull(),
    derivedFrom: uuid('derived_from').references((): AnyPgColumn => checklistTemplate.id),
    ...timestamps,
  },
  (t) => [index('checklist_template_firm_idx').on(t.accountingFirmId)],
).enableRLS();

export const checklistTemplateItem = pgTable(
  'checklist_template_item',
  {
    id: id(),
    checklistTemplateId: uuid('checklist_template_id')
      .notNull()
      .references(() => checklistTemplate.id, { onDelete: 'cascade' }),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentType.id),
    periodicity: text().notNull().default('monthly'),
    annualMonth: smallint('annual_month'),
    dueDay: smallint('due_day'),
    dueMonthOffset: smallint('due_month_offset').notNull().default(1),
    conditionFlag: text('condition_flag'),
    required: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique('checklist_template_item_uidx').on(t.checklistTemplateId, t.documentTypeId),
    check('checklist_template_item_periodicity_chk', oneOf(sql`${t.periodicity}`, PERIODICITIES)),
    index('checklist_template_item_doc_type_idx').on(t.documentTypeId),
  ],
).enableRLS();

export const company = pgTable(
  'company',
  {
    id: id(),
    accountingFirmId: uuid('accounting_firm_id')
      .notNull()
      .references(() => accountingFirm.id),
    checklistTemplateId: uuid('checklist_template_id').references(() => checklistTemplate.id),
    responsibleAccountantId: uuid('responsible_accountant_id').references(() => accountant.id, {
      onDelete: 'set null',
    }),
    name: text().notNull(),
    cnpj: text(),
    flags: jsonb().$type<CompanyFlags>().notNull().default({}),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    /* Mesma Contabilidade não pode ter duas Empresas com o mesmo CNPJ — é a chave que o
     * import por planilha usa pra fazer upsert em vez de duplicar em reenvio. Parcial
     * porque CNPJ é opcional. */
    uniqueIndex('company_cnpj_uidx')
      .on(t.accountingFirmId, t.cnpj)
      .where(sql`${t.cnpj} is not null`),
    index('company_firm_active_idx').on(t.accountingFirmId, t.active),
    index('company_responsible_accountant_idx').on(t.responsibleAccountantId),
  ],
).enableRLS();

export const contact = pgTable(
  'contact',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    /* SEM unique: o mesmo user é Responsável por N Empresas (um `contact` por Empresa).
     * A FK é a junção user→contacts. */
    authUserId: uuid('auth_user_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    /* `email` é a entrada de `/access/recover` — rota pública e sem sessão, o pior lugar
     * para um seq scan. `company_id` é o join de toda listagem de Empresa (FK no Postgres
     * não cria índice). `auth_user_id` é o caminho do ContactGuard em toda request logada. */
    index('contact_email_idx').on(t.email),
    index('contact_company_idx').on(t.companyId),
    index('contact_auth_user_idx').on(t.authUserId),
  ],
).enableRLS();

export const invite = pgTable(
  'invite',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    email: text().notNull(),
    accountingFirmId: uuid('accounting_firm_id').references(() => accountingFirm.id, {
      onDelete: 'cascade',
    }),
    companyId: uuid('company_id').references(() => company.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** autoria (OPS-1): qual contador criou o convite */
    createdBy: uuid('created_by').references(() => accountant.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    check('invite_has_one_origin', sql`num_nonnulls(${t.accountingFirmId}, ${t.companyId}) = 1`),
    index('invite_firm_idx').on(t.accountingFirmId),
    index('invite_company_idx').on(t.companyId),
  ],
).enableRLS();

export const companyChecklistOverride = pgTable(
  'company_checklist_override',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentType.id),
    action: text().notNull(),
    periodicity: text(),
    annualMonth: smallint('annual_month'),
    dueDay: smallint('due_day'),
    dueMonthOffset: smallint('due_month_offset'),
    conditionFlag: text('condition_flag'),
    required: boolean(),
    ...timestamps,
  },
  (t) => [
    unique('company_checklist_override_uidx').on(t.companyId, t.documentTypeId),
    check('company_checklist_override_action_chk', oneOf(sql`${t.action}`, OVERRIDE_ACTIONS)),
    check(
      'company_checklist_override_periodicity_chk',
      sql`${t.periodicity} is null or ${oneOf(sql`${t.periodicity}`, PERIODICITIES)}`,
    ),
  ],
).enableRLS();

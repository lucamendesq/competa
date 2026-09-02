import { boolean, check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { id, timestamps } from './columns.js';

export const accountingFirm = pgTable('accounting_firm', {
  id: id(),
  name: text().notNull(),
  ...timestamps,
});

export const accountant = pgTable('accountant', {
  id: id(),
  accountingFirmId: uuid('accounting_firm_id')
    .notNull()
    .references(() => accountingFirm.id, { onDelete: 'cascade' }),
  authUserId: uuid('auth_user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const company = pgTable('company', {
  id: id(),
  accountingFirmId: uuid('accounting_firm_id')
    .notNull()
    .references(() => accountingFirm.id),
  name: text().notNull(),
  cnpj: text(),
  flags: jsonb().notNull().default({}),
  active: boolean().notNull().default(true),
  ...timestamps,
});

/** Responsável da Empresa. `authUserId` é opcional: o fluxo de upload
 *  nunca exige conta; login existe só para push/App (spec D-04). */
export const contact = pgTable('contact', {
  id: id(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => company.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  email: text().notNull(),
  phone: text(),
  authUserId: uuid('auth_user_id')
    .unique()
    .references(() => user.id, { onDelete: 'set null' }),
  ...timestamps,
});

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
    ...timestamps,
  },
  (t) => [
    // um convite pertence a exatamente uma origem: firm OU empresa
    check(
      'invite_has_one_origin',
      sql`num_nonnulls(${t.accountingFirmId}, ${t.companyId}) = 1`,
    ),
  ],
);

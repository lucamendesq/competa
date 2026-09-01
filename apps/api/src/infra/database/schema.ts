import { check, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { defineRelations, sql } from 'drizzle-orm';
import { user } from './auth-schema.js';
import { identificationDefaultColumns, timestampDefaultColumns } from './shared-schemas.js';

export * from './auth-schema.js';

export const accounting = pgTable('accounting', {
  ...identificationDefaultColumns,
  name: varchar().notNull(),
  ...timestampDefaultColumns,
});

export const company = pgTable('company', {
  ...identificationDefaultColumns,
  ...timestampDefaultColumns,
});

export const representative = pgTable('representative', {
  ...identificationDefaultColumns,
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => company.id),
  phone: varchar(),
  ...timestampDefaultColumns,
});

export const accountant = pgTable('accountant', {
  ...identificationDefaultColumns,
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountingId: uuid('accounting_id')
    .notNull()
    .references(() => accounting.id),
  ...timestampDefaultColumns,
});

export const invite = pgTable(
  'invite',
  {
    ...identificationDefaultColumns,
    token: varchar().notNull().unique(),
    accountingId: uuid('accounting_id').references(() => accounting.id, {
      onDelete: 'cascade',
    }),
    companyId: uuid('company_id').references(() => company.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expired_at', {
      withTimezone: true,
    }).notNull(),
    acceptedAt: timestamp('accepted_at', {
      withTimezone: true,
    }),
    ...timestampDefaultColumns,
  },
  (t) => [
    // an invite belongs to exactly one origin, never both, never neither
    check(
      'invite_has_one_origin',
      sql`num_nonnulls(${t.accountingId}, ${t.companyId}) = 1`,
    ),
  ],
);

export const relations = defineRelations(
  { accounting, company, representative, accountant, invite, user },
  (r) => ({
    accounting: {
      accountants: r.many.accountant(),
      invites: r.many.invite(),
    },
    accountant: {
      accounting: r.one.accounting({
        from: r.accountant.accountingId,
        to: r.accounting.id,
      }),
      user: r.one.user({
        from: r.accountant.userId,
        to: r.user.id,
      }),
    },
    company: {
      representatives: r.many.representative(),
      invites: r.many.invite(),
    },
    representative: {
      company: r.one.company({
        from: r.representative.companyId,
        to: r.company.id,
      }),
      user: r.one.user({
        from: r.representative.userId,
        to: r.user.id,
      }),
    },
    invite: {
      accounting: r.one.accounting({
        from: r.invite.accountingId,
        to: r.accounting.id,
      }),
      company: r.one.company({
        from: r.invite.companyId,
        to: r.company.id,
      }),
    },
  }),
);

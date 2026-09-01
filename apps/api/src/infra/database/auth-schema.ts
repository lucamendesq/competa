import { defineRelations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { identificationDefaultColumns, timestampDefaultColumns } from './shared-schemas.js';

export const user = pgTable('user', {
  ...identificationDefaultColumns,
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  ...timestampDefaultColumns,
});

export const session = pgTable(
  'session',
  {
    ...identificationDefaultColumns,
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestampDefaultColumns,
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    ...identificationDefaultColumns,
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    ...timestampDefaultColumns,
  },
  (table) => [
    uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
    index('account_userId_idx').on(table.userId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    ...identificationDefaultColumns,
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ...timestampDefaultColumns,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const relations = defineRelations({ user, account, session, verification }, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
}));

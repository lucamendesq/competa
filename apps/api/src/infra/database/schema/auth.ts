import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { id, timestamps } from './columns.js';

export const user = pgTable('user', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  ...timestamps,
});

export const session = pgTable(
  'session',
  {
    id: id(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: id(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
    index('account_userId_idx').on(table.userId),
  ],
);

/** `id` é `text`, não `uuid`: o Better Auth grava aqui ids próprios que não são uuid
 *  (`reserveVerificationValue` do fluxo de magic link usa chave determinística). A tabela é
 *  gerenciada pela biblioteca — quem manda na forma é ela, não a nossa convenção de PK. */
export const verification = pgTable(
  'verification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** Tabela do plugin `@better-auth/passkey` (WebAuthn). É a credencial que sobrevive à
 *  reinstalação do app: a chave vive no keychain sincronizado do aparelho, então o
 *  Responsável entra por biometria sem precisar de email de novo (Fase 10, decisão do
 *  brainstorm de 2026-09-04). */
export const passkey = pgTable(
  'passkey',
  {
    id: id(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_i_d').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('passkey_user_id_idx').on(t.userId)],
);

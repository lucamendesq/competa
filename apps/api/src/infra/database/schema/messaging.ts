import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { jsonb, unique } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.js';
import { request } from './collection.js';
import { contact } from './registry.js';

const oneOf = (column: SQL, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;

export const MESSAGE_CHANNELS = ['email', 'whatsapp', 'push'] as const;
export const MESSAGE_PURPOSES = [
  'link_delivery',
  'reminder',
  'rejection',
  'deadline_missed',
  'completion',
] as const;
export const MESSAGE_STATUS = ['queued', 'sent', 'delivered', 'failed'] as const;

export const message = pgTable(
  'message',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id, { onDelete: 'cascade' }),
    channel: text().notNull(),
    purpose: text().notNull(),
    recipient: text().notNull(),
    status: text().notNull().default('queued'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text(),
    ...timestamps,
  },
  (t) => [
    check('message_channel_chk', oneOf(sql`${t.channel}`, MESSAGE_CHANNELS)),
    check('message_purpose_chk', oneOf(sql`${t.purpose}`, MESSAGE_PURPOSES)),
    check('message_status_chk', oneOf(sql`${t.status}`, MESSAGE_STATUS)),
    index('message_reminder_idx').on(t.requestId, t.purpose),
  ],
);

export const PUSH_PROVIDERS = ['web', 'fcm'] as const;

export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: id(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    provider: text().notNull().default('web'),
    endpoint: text().notNull(),
    keys: jsonb().notNull(),
    ...timestamps,
  },
  (t) => [
    /* Par, não endpoint sozinho: o mesmo aparelho serve os N contatos de um user
     * multi-empresa — e o upsert deixa de poder ROUBAR a linha de outro contato (AUTHZ-4). */
    unique('push_subscription_contact_endpoint_uidx').on(t.contactId, t.endpoint),
    check('push_subscription_provider_chk', oneOf(sql`${t.provider}`, PUSH_PROVIDERS)),
  ],
);

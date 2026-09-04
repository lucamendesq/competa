import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { id, timestamps } from './columns.js';
import { request } from './collection.js';

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

/** Log/outbox de tudo que sai. A cadência "máx. 2 lembretes" é
 *  `count(*) where purpose='reminder'` por request — sem tabela extra. */
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
    /** motivo da falha do provedor — o que o painel de pendências mostra */
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

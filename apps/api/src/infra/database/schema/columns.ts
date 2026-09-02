import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** PK padrão: uuidv7 gerado na aplicação (ordenação temporal de graça). */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

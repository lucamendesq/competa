import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { nanoid } from 'nanoid';

export const timestampDefaultColumns = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const identificationDefaultColumns = {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7())
    .notNull(),
  publicId: varchar('public_id')
    .$defaultFn(() => nanoid())
    .notNull(),
};

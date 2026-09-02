import { pgEnum, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.js';
import { accountingFirm } from './registry.js';

export const documentTypeCategoryEnum = pgEnum('category', [
  'fiscal',
  'financial',
  'expense',
  'payroll',
  'tax',
  'corporate',
]);

export const documentType = pgTable('document_type', {
  id: id(),
  accountingFirmId: uuid().references(() => accountingFirm.id, { onDelete: 'cascade' }),
  name: varchar().notNull(),
  category: documentTypeCategoryEnum(),
  acceptedFormats: text('accepted_formats').array().notNull().default([]),
  description: text('description'),
  ...timestamps,
});

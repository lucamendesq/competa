import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { id, timestamps } from './columns.js';
import { accountingFirm, company, contact, documentType } from './registry.js';

/** Estados como `text` + check (nunca enum nativo). */
const oneOf = (column: SQL, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;

export const PERIOD_STATUS = ['open', 'closed'] as const;
export const REQUEST_STATUS = ['open', 'complete', 'closed'] as const;
export const REQUEST_ITEM_STATUS = ['pending', 'submitted', 'accepted', 'rejected'] as const;
export const DOCUMENT_REVIEW_STATUS = ['pending', 'accepted', 'rejected'] as const;

/** Competência — abre uma vez por Contabilidade. */
export const period = pgTable(
  'period',
  {
    id: id(),
    accountingFirmId: uuid('accounting_firm_id')
      .notNull()
      .references(() => accountingFirm.id),
    /** sempre dia 1: 2026-07-01 = competência 2026-07 */
    referenceMonth: date('reference_month').notNull(),
    status: text().notNull().default('open'),
    /** prazo geral opcional (fallback dos itens) */
    dueDate: date('due_date'),
    ...timestamps,
  },
  (t) => [
    unique('period_firm_month_uidx').on(t.accountingFirmId, t.referenceMonth),
    check('period_status_chk', oneOf(sql`${t.status}`, PERIOD_STATUS)),
  ],
);

/** Solicitação — UMA Empresa em UMA Competência. */
export const request = pgTable(
  'request',
  {
    id: id(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => period.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => company.id),
    status: text().notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('request_period_company_uidx').on(t.periodId, t.companyId),
    check('request_status_chk', oneOf(sql`${t.status}`, REQUEST_STATUS)),
  ],
);

/** Item — SNAPSHOT congelado na abertura: mudança no template depois não afeta. */
export const requestItem = pgTable(
  'request_item',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id, { onDelete: 'cascade' }),
    /** só p/ relatórios; os campos abaixo são cópia */
    documentTypeId: uuid('document_type_id').references(() => documentType.id),
    name: text().notNull(),
    description: text(),
    acceptedFormats: text('accepted_formats').array().notNull(),
    /** congelado: reference_month + due_month_offset + due_day;
     *  NULL → herda period.due_date → sem prazo */
    dueDate: date('due_date'),
    status: text().notNull().default('pending'),
    /** quando o estouro de prazo deste Item já foi avisado — idempotência do cron
     *  (DeadlineMissed). Em memória, reiniciar a API reavisaria o cliente. */
    deadlineNotifiedAt: timestamp('deadline_notified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('request_item_status_chk', oneOf(sql`${t.status}`, REQUEST_ITEM_STATUS)),
    // Painel de Pendências
    index('request_item_pending_idx').on(t.requestId, t.status),
  ],
);

/** Arquivo enviado (1 Item : N Documentos). `request_item_id` NULL = Documento Extra. */
export const document = pgTable(
  'document',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id),
    requestItemId: uuid('request_item_id').references(() => requestItem.id),
    /** caminho no R2 */
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    reviewStatus: text('review_status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    ...timestamps,
  },
  (t) => [check('document_review_status_chk', oneOf(sql`${t.reviewStatus}`, DOCUMENT_REVIEW_STATUS))],
);

/** Link de Upload — token próprio, NÃO é sessão/auth. Só o hash é persistido. */
export const uploadLink = pgTable('upload_link', {
  id: id(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => request.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contact.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean().notNull().default(false),
  ...timestamps,
});

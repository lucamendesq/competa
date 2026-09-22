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
import { accountant, accountingFirm, company, contact, documentType } from './registry.js';

const oneOf = (column: SQL, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;

export const PERIOD_STATUS = ['open', 'closed'] as const;
export const REQUEST_STATUS = ['open', 'complete', 'closed'] as const;
export const REQUEST_ITEM_STATUS = ['pending', 'submitted', 'accepted', 'rejected'] as const;
export const DOCUMENT_REVIEW_STATUS = ['pending', 'accepted', 'rejected'] as const;
/** `awaiting_upload` = linha criada no presign, arquivo ainda não confirmado no storage.
 *  Sem isso, presign sem PUT deixa documento fantasma contando como enviado. */
export const DOCUMENT_UPLOAD_STATUS = ['awaiting_upload', 'uploaded'] as const;

export const period = pgTable(
  'period',
  {
    id: id(),
    accountingFirmId: uuid('accounting_firm_id')
      .notNull()
      .references(() => accountingFirm.id),
    referenceMonth: date('reference_month').notNull(),
    status: text().notNull().default('open'),
    dueDate: date('due_date'),
    ...timestamps,
  },
  (t) => [
    unique('period_firm_month_uidx').on(t.accountingFirmId, t.referenceMonth),
    check('period_status_chk', oneOf(sql`${t.status}`, PERIOD_STATUS)),
  ],
).enableRLS();

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
    index('request_company_idx').on(t.companyId),
  ],
).enableRLS();

export const requestItem = pgTable(
  'request_item',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id, { onDelete: 'cascade' }),
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
    index('request_item_pending_idx').on(t.requestId, t.status),
  ],
).enableRLS();

export const document = pgTable(
  'document',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id),
    requestItemId: uuid('request_item_id').references(() => requestItem.id),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** só é preenchido na confirmação: antes disso o arquivo não existe no storage */
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    uploadStatus: text('upload_status').notNull().default('awaiting_upload'),
    uploadedByContactId: uuid('uploaded_by_contact_id').references(() => contact.id, {
      onDelete: 'set null',
    }),
    reviewStatus: text('review_status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    /** autoria da decisão de revisão (OPS-1): quem aceitou/rejeitou, e quando */
    reviewedBy: uuid('reviewed_by').references(() => accountant.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('document_review_status_chk', oneOf(sql`${t.reviewStatus}`, DOCUMENT_REVIEW_STATUS)),
    check('document_upload_status_chk', oneOf(sql`${t.uploadStatus}`, DOCUMENT_UPLOAD_STATUS)),
    index('document_pending_upload_idx').on(t.uploadStatus, t.createdAt),
    /* Chave estrangeira não cria índice no Postgres. Estes dois são o caminho de TODA tela
     * de revisão e de todo zip ("os documentos desta Solicitação", "deste Item"), e sem
     * eles é seq scan em `document` — a tabela que mais cresce no produto. */
    index('document_request_idx').on(t.requestId),
    index('document_request_item_idx').on(t.requestItemId),
    index('document_reviewed_by_idx').on(t.reviewedBy),
    index('document_uploaded_by_contact_idx').on(t.uploadedByContactId),
  ],
).enableRLS();

/** Link de Upload — token próprio, NÃO é sessão/auth. Só o hash é persistido. */
export const uploadLink = pgTable(
  'upload_link',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => request.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    previousTokenHash: text('previous_token_hash'),
    previousExpiresAt: timestamp('previous_expires_at', { withTimezone: true }),
    revoked: boolean().notNull().default(false),
    ...timestamps,
  },
  // toda rotação e todo reenvio buscam por `request_id`; o índice do token não serve aqui
  (t) => [
    unique('upload_link_request_uidx').on(t.requestId),
    index('upload_link_request_idx').on(t.requestId),
    index('upload_link_contact_idx').on(t.contactId),
    index('upload_link_previous_token_idx').on(t.previousTokenHash),
  ],
).enableRLS();

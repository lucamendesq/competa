import * as z from 'zod';
import { CompanyFlags } from './registry.js';

export const CompanySummaryResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  cnpj: z.string().nullable(),
  flags: CompanyFlags,
  active: z.boolean(),
  checklistTemplateId: z.uuid().nullable(),
  templateName: z.string().nullable(),
  contactCount: z.number(),
  contacts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      email: z.string(),
    }),
  ),
  readyContactCount: z.number(),
});
export type CompanySummaryResponse = z.infer<typeof CompanySummaryResponse>;

export const ContactDetailResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  hasAccess: z.boolean().optional(),
});
export type ContactDetailResponse = z.infer<typeof ContactDetailResponse>;

export const CompanyDetailResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  cnpj: z.string().nullable(),
  flags: CompanyFlags,
  active: z.boolean(),
  checklistTemplateId: z.uuid().nullable(),
  templateName: z.string().nullable(),
  readyContactCount: z.number(),
  contacts: z.array(ContactDetailResponse),
});
export type CompanyDetailResponse = z.infer<typeof CompanyDetailResponse>;

export const PeriodSummaryResponse = z.object({
  id: z.uuid(),
  referenceMonth: z.string(),
  status: z.enum(['open', 'closed']),
  dueDate: z.string().nullable(),
  requestCount: z.number(),
  createdAt: z.string(),
});
export type PeriodSummaryResponse = z.infer<typeof PeriodSummaryResponse>;

export const PeriodDetailResponse = PeriodSummaryResponse.extend({
  completeRequestCount: z.number(),
  pendingItemCount: z.number(),
});
export type PeriodDetailResponse = z.infer<typeof PeriodDetailResponse>;

export const MissingItemResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(['pending', 'submitted', 'accepted', 'rejected']),
  dueDate: z.string().nullable(),
  resent: z.boolean(),
});
export type MissingItemResponse = z.infer<typeof MissingItemResponse>;

export const ChannelFailureResponse = z.object({
  requestId: z.uuid(),
  channel: z.string(),
  purpose: z.string(),
  recipient: z.string(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type ChannelFailureResponse = z.infer<typeof ChannelFailureResponse>;

export const PanelRowResponse = z.object({
  companyId: z.uuid(),
  companyName: z.string(),
  requestId: z.uuid(),
  requestStatus: z.enum(['open', 'complete', 'closed']),
  counts: z.object({
    pending: z.number(),
    submitted: z.number(),
    accepted: z.number(),
    rejected: z.number(),
  }),
  missing: z.array(MissingItemResponse),
  channelFailures: z.array(ChannelFailureResponse),
});
export type PanelRowResponse = z.infer<typeof PanelRowResponse>;

export const RequestDocumentResponse = z.object({
  id: z.uuid(),
  requestItemId: z.uuid().nullable(),
  fileName: z.string(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
  reviewStatus: z.enum(['pending', 'accepted', 'rejected']),
  rejectionReason: z.string().nullable(),
  uploadedByContactId: z.uuid().nullable(),
});
export type RequestDocumentResponse = z.infer<typeof RequestDocumentResponse>;

export const RequestItemResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['pending', 'submitted', 'accepted', 'rejected']),
  dueDate: z.string().nullable(),
  acceptedFormats: z.array(z.string()),
  documents: z.array(RequestDocumentResponse),
});
export type RequestItemResponse = z.infer<typeof RequestItemResponse>;

export const RequestDetailResponse = z.object({
  id: z.uuid(),
  status: z.enum(['open', 'complete', 'closed']),
  closedAt: z.string().nullable(),
  companyId: z.uuid(),
  companyName: z.string(),
  periodId: z.uuid(),
  referenceMonth: z.string(),
  periodDueDate: z.string().nullable(),
  items: z.array(RequestItemResponse),
  extraDocuments: z.array(RequestDocumentResponse),
});
export type RequestDetailResponse = z.infer<typeof RequestDetailResponse>;

export const UploadLinkResultResponse = z.object({
  uploadUrl: z.string(),
  contactEmail: z.string(),
});
export type UploadLinkResultResponse = z.infer<typeof UploadLinkResultResponse>;

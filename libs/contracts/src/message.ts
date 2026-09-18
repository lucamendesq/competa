import * as z from 'zod';
import { PaginationQuery } from './pagination.js';

export const MESSAGE_STATUS = ['queued', 'sent', 'delivered', 'failed'] as const;
export const MESSAGE_CHANNELS = ['email', 'whatsapp', 'push'] as const;
export const MESSAGE_PURPOSES = [
  'link_delivery',
  'resend',
  'reminder',
  'rejection',
  'deadline_missed',
  'completion',
] as const;

export const MessageListQuery = PaginationQuery.extend({
  requestId: z.uuid().optional(),
  periodId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  channel: z.enum(MESSAGE_CHANNELS).optional(),
  purpose: z.enum(MESSAGE_PURPOSES).optional(),
  status: z.enum(MESSAGE_STATUS).optional(),
});
export type MessageListQuery = z.infer<typeof MessageListQuery>;

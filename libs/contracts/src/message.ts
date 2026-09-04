import * as z from 'zod';
import { PaginationQuery } from './pagination.js';

/** Contratos de messaging (Fase 5). */
export const MESSAGE_STATUS = ['queued', 'sent', 'delivered', 'failed'] as const;

export const MessageListQuery = PaginationQuery.extend({
  requestId: z.uuid().optional(),
  periodId: z.uuid().optional(),
  status: z.enum(MESSAGE_STATUS).optional(),
});
export type MessageListQuery = z.infer<typeof MessageListQuery>;

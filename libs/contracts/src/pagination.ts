import * as z from 'zod';

/** Query de paginação de toda coleção da API. Reflete o envelope { data, meta }. */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

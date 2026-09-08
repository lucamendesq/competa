import * as z from 'zod';
import { DocumentCategory } from './registry.js';
import { PaginationQuery } from './pagination.js';

export const DocumentTypeQuery = PaginationQuery.extend({
  category: DocumentCategory.optional(),
});
export type DocumentTypeQuery = z.infer<typeof DocumentTypeQuery>;

import { Controller, Get, Query } from '@nestjs/common';
import { DocumentTypeQuery } from '@competa/contracts';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { ChecklistRepository } from './checklist.repository.js';

@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly checklists: ChecklistRepository) { }

  @Get()
  async list(
    @CurrentScope() scope: FirmScope,
    @Query(zodPipe(DocumentTypeQuery)) query: DocumentTypeQuery,
  ) {
    const { rows, total } = await this.checklists.listDocumentTypes(scope, query);

    return paginated(rows, { page: query.page, perPage: query.perPage, total });
  }
}

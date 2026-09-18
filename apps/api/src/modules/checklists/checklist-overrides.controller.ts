import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { CompanyIdParam, CreateOverrideBody, OverrideParam } from '@competa/contracts';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { ChecklistRepository } from './checklist.repository.js';
import { DocumentTypeNotVisible } from './errors.js';

@Controller('companies/:companyId')
export class ChecklistOverridesController {
  constructor(private readonly checklists: ChecklistRepository) { }

  @Get('checklist')
  async effective(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(CompanyIdParam)) params: CompanyIdParam,
  ) {
    const checklist = await this.checklists.effectiveChecklist(scope, params.companyId);
    if (!checklist) throw new NotFound('Empresa não encontrada.');

    return checklist;
  }

  @Get('checklist-overrides')
  async list(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(CompanyIdParam)) params: CompanyIdParam,
  ) {
    await this.requireCompany(scope, params.companyId);

    return this.checklists.listOverrides(scope, params.companyId);
  }

  @Put('checklist-overrides')
  async upsert(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(CompanyIdParam)) params: CompanyIdParam,
    @Body(zodPipe(CreateOverrideBody)) body: CreateOverrideBody,
  ) {
    await this.requireCompany(scope, params.companyId);

    const [visible] = await this.checklists.documentTypesVisible(scope, [body.documentTypeId]);
    if (!visible) throw new DocumentTypeNotVisible();

    return this.checklists.upsertOverride(params.companyId, body);
  }

  @Delete('checklist-overrides/:documentTypeId')
  @HttpCode(204)
  async remove(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(OverrideParam)) params: OverrideParam,
  ) {
    await this.requireCompany(scope, params.companyId);

    const row = await this.checklists.deleteOverride(params.companyId, params.documentTypeId);
    if (!row) throw new NotFound('Override não encontrado.');
  }

  private async requireCompany(scope: FirmScope, companyId: string) {
    const context = await this.checklists.companyChecklistContext(scope, companyId);
    if (!context) throw new NotFound('Empresa não encontrada.');

    return context;
  }
}

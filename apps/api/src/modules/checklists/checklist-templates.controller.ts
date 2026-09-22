import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  CreateTemplateItemBody,
  DeriveTemplateBody,
  IdParam,
  TemplateItemParam,
  UpdateTemplateBody,
  UpdateTemplateItemBody,
} from '@competa/contracts';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { ChecklistRepository } from './checklist.repository.js';
import {
  DocumentTypeNotVisible,
  TemplateAlreadyOwned,
  TemplateImmutable,
  TemplateInUse,
  TemplateItemDuplicated,
} from './errors.js';

@Controller('checklist-templates')
export class ChecklistTemplatesController {
  constructor(private readonly checklists: ChecklistRepository) {}

  @Get()
  async list(@CurrentScope() scope: FirmScope) {
    return this.checklists.listTemplates(scope);
  }

  @Get(':id')
  async get(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const template = await this.requireVisible(scope, params.id);

    return { ...template, items: await this.checklists.listTemplateItems(template.id) };
  }

  @Post(':id/derive')
  async derive(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(DeriveTemplateBody)) body: DeriveTemplateBody,
  ) {
    const source = await this.requireVisible(scope, params.id);
    if (source.accountingFirmId) throw new TemplateAlreadyOwned();

    return this.checklists.deriveTemplate(scope, source, body.name);
  }

  @Patch(':id')
  async rename(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(UpdateTemplateBody)) body: UpdateTemplateBody,
  ) {
    await this.requireOwned(scope, params.id);

    return this.checklists.renameTemplate(scope, params.id, body.name);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    await this.requireOwned(scope, params.id);

    const count = await this.checklists.countCompaniesUsingTemplate(scope, params.id);
    if (count > 0) throw new TemplateInUse(count);

    const row = await this.checklists.deleteTemplate(scope, params.id);
    if (!row) throw new NotFound('Template não encontrado.');
  }

  @Post(':id/items')
  async addItem(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(CreateTemplateItemBody)) body: CreateTemplateItemBody,
  ) {
    await this.requireOwned(scope, params.id);

    const [visible] = await this.checklists.documentTypesVisible(scope, [body.documentTypeId]);
    if (!visible) throw new DocumentTypeNotVisible();

    const row = await this.checklists.addTemplateItem(scope, params.id, body);
    if (!row) throw new TemplateItemDuplicated();

    return row;
  }

  @Patch(':id/items/:itemId')
  async updateItem(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(TemplateItemParam)) params: TemplateItemParam,
    @Body(zodPipe(UpdateTemplateItemBody)) body: UpdateTemplateItemBody,
  ) {
    await this.requireOwned(scope, params.id);

    const row = await this.checklists.updateTemplateItem(scope, params.id, params.itemId, body);
    if (!row) throw new NotFound('Item do template não encontrado.');

    return row;
  }

  @Delete(':id/items/:itemId')
  @HttpCode(204)
  async removeItem(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(TemplateItemParam)) params: TemplateItemParam,
  ) {
    await this.requireOwned(scope, params.id);

    const row = await this.checklists.deleteTemplateItem(scope, params.id, params.itemId);
    if (!row) throw new NotFound('Item do template não encontrado.');
  }

  private async requireVisible(scope: FirmScope, templateId: string) {
    const template = await this.checklists.findTemplate(scope, templateId);
    if (!template) throw new NotFound('Template não encontrado.');

    return template;
  }

  private async requireOwned(scope: FirmScope, templateId: string) {
    const template = await this.requireVisible(scope, templateId);
    if (!template.accountingFirmId) throw new TemplateImmutable();

    return template;
  }
}

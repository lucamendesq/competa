import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CompanyQuery,
  ContactBody,
  CreateCompanyBody,
  IdParam,
  ImportCompaniesBody,
  UpdateCompanyBody,
} from '@contabilidade/contracts';
import * as z from 'zod';
import { NotFound, ValidationError } from '../../lib/app-error.js';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { CompanyRepository } from './company.repository.js';

const ContactParam = z.object({ id: z.uuid(), contactId: z.uuid() });
type ContactParam = z.infer<typeof ContactParam>;

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompanyRepository) {}

  @Get()
  async list(@CurrentScope() scope: FirmScope, @Query(zodPipe(CompanyQuery)) query: CompanyQuery) {
    const { rows, total } = await this.companies.list(scope, query);

    return paginated(rows, { page: query.page, perPage: query.perPage, total });
  }

  @Post()
  async create(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(CreateCompanyBody)) body: CreateCompanyBody,
  ) {
    await this.requireTemplate(scope, body.checklistTemplateId);

    return this.companies.create(scope, body);
  }

  @Post('import')
  async import(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(ImportCompaniesBody)) body: ImportCompaniesBody,
  ) {
    return this.companies.importFromCsv(scope, body.csv);
  }

  @Get(':id')
  async get(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const row = await this.companies.findById(scope, params.id);
    if (!row) throw new NotFound('Empresa não encontrada.');

    return row;
  }

  @Patch(':id')
  async update(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(UpdateCompanyBody)) body: UpdateCompanyBody,
  ) {
    if (body.checklistTemplateId) await this.requireTemplate(scope, body.checklistTemplateId);

    const row = await this.companies.update(scope, params.id, body);
    if (!row) throw new NotFound('Empresa não encontrada.');

    return row;
  }

  @Delete(':id')
  async deactivate(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const row = await this.companies.deactivate(scope, params.id);
    if (!row) throw new NotFound('Empresa não encontrada.');

    return row;
  }

  @Get(':id/contacts')
  async listContacts(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    if (!(await this.companies.findOwnedId(scope, params.id))) {
      throw new NotFound('Empresa não encontrada.');
    }

    return this.companies.listContacts(scope, params.id);
  }

  @Post(':id/contacts')
  async addContact(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(IdParam)) params: IdParam,
    @Body(zodPipe(ContactBody)) body: ContactBody,
  ) {
    const row = await this.companies.addContact(scope, params.id, body);
    if (!row) throw new NotFound('Empresa não encontrada.');

    return row;
  }

  @Patch(':id/contacts/:contactId')
  async updateContact(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(ContactParam)) params: ContactParam,
    @Body(zodPipe(ContactBody.partial())) body: Partial<ContactBody>,
  ) {
    const row = await this.companies.updateContact(scope, params.id, params.contactId, body);
    if (!row) throw new NotFound('Responsável não encontrado.');

    return row;
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(204)
  async deleteContact(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(ContactParam)) params: ContactParam,
  ) {
    const row = await this.companies.deleteContact(scope, params.id, params.contactId);
    if (!row) throw new NotFound('Responsável não encontrado.');
  }

  private async requireTemplate(scope: FirmScope, templateId: string) {
    if (!(await this.companies.templateIsVisible(scope, templateId))) {
      throw new ValidationError('Template de checklist inexistente ou de outra Contabilidade.');
    }
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CompanyQuery,
  ContactBody,
  CreateCompanyBody,
  IdParam,
  ImportCompaniesBody,
  SendAccessInvitesBody,
  UpdateCompanyBody,
} from '@contabilidade/contracts';
import { addDays } from 'date-fns';
import * as z from 'zod';
import env from '../../config/env.js';
import { type ContactInvitedEvent, EVENTS } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import { InviteRepository } from '../auth/invite.repository.js';
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
  constructor(
    private readonly companies: CompanyRepository,
    private readonly invites: InviteRepository,
    private readonly events: EventEmitter2,
  ) {}

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

  @Post('access-invites')
  async sendAccessInvites(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(SendAccessInvitesBody)) body: SendAccessInvitesBody,
  ) {
    const results = [];

    for (const companyId of body.companyIds) {
      const found = await this.companies.findById(scope, companyId);
      if (!found) {
        results.push({ companyId, status: 'error' as const, reason: 'Empresa não encontrada.' });
        continue;
      }

      for (const contact of found.contacts) {
        const sent = await this.inviteToApp(scope, {
          companyId,
          companyName: found.name,
          contact,
        });

        results.push({
          companyId,
          companyName: found.name,
          email: contact.email,
          status: sent ? ('invited' as const) : ('skipped' as const),
        });
      }

      if (!found.contacts.length) {
        results.push({
          companyId,
          companyName: found.name,
          status: 'skipped' as const,
          reason: 'Empresa sem Responsável cadastrado.',
        });
      }
    }

    return {
      invited: results.filter((row) => row.status === 'invited').length,
      skipped: results.filter((row) => row.status !== 'invited').length,
      results,
    };
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

  private async inviteToApp(
    scope: FirmScope,
    input: {
      companyId: string;
      companyName: string;
      contact: { id: string; name: string; email: string };
    },
  ) {
    if (await this.invites.pendingForContact(input.companyId, input.contact.email)) return false;

    const { token, tokenHash } = createToken();
    const expiresAt = addDays(new Date(), env.INVITE_TTL_DAYS);

    await this.invites.createForCompany({
      companyId: input.companyId,
      email: input.contact.email,
      tokenHash,
      expiresAt,
    });

    const invited: ContactInvitedEvent = {
      contactId: input.contact.id,
      contactName: input.contact.name,
      contactEmail: input.contact.email,
      companyName: input.companyName,
      firmName: await this.invites.firmName(scope),
      inviteUrl: `${env.WEB_URL}/convite/${token}`,
      expiresAt,
    };

    this.events.emit(EVENTS.ContactInvited, invited);

    return true;
  }

  private async requireTemplate(scope: FirmScope, templateId: string) {
    if (!(await this.companies.templateIsVisible(scope, templateId))) {
      throw new ValidationError('Template de checklist inexistente ou de outra Contabilidade.');
    }
  }
}

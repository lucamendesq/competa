import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CreateInviteBody, InviteTokenParam } from '@contabilidade/contracts';
import { addDays } from 'date-fns';
import env from '../../config/env.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { createToken } from '../../lib/token.js';
import { CurrentScope } from './current-scope.decorator.js';
import { EVENTS, type InviteCreatedEvent } from '../../lib/events.js';
import { InviteRepository } from './invite.repository.js';
import type { FirmScope } from './scope.js';

@Controller('invites')
export class InviteController {
  constructor(
    private readonly invites: InviteRepository,
    private readonly events: EventEmitter2,
  ) {}

  @Post()
  async create(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(CreateInviteBody)) body: CreateInviteBody,
  ) {
    const { token, tokenHash } = createToken();
    const expiresAt = addDays(new Date(), env.INVITE_TTL_DAYS);
    const row = await this.invites.createForFirm(scope, {
      email: body.email,
      tokenHash,
      expiresAt,
    });

    const url = `${env.WEB_URL}/convite/${token}`;

    // messaging entrega o convite (Fase 5). A URL continua na resposta porque o Contador
    // pode precisar passar o link por outro canal se o email não chegar.
    const created: InviteCreatedEvent = {
      email: row.email,
      firmName: await this.invites.firmName(scope),
      inviteUrl: url,
      expiresAt,
    };

    this.events.emit(EVENTS.InviteCreated, created);

    return { id: row.id, email: row.email, url };
  }

  @Get(':token')
  @AllowAnonymous()
  async preview(@Param(zodPipe(InviteTokenParam)) params: InviteTokenParam) {
    const row = await this.invites.findUsable(params.token);

    return {
      email: row.email,
      invitedBy: row.firmName ?? row.companyName,
      target: row.accountingFirmId ? 'accounting_firm' : 'company',
    };
  }
}

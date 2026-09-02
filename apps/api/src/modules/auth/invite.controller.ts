import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CreateInviteBody, InviteTokenParam } from '@contabilidade/contracts';
import { addDays } from 'date-fns';
import env from '../../config/env.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { createToken } from '../../lib/token.js';
import { CurrentScope } from './current-scope.decorator.js';
import { InviteRepository } from './invite.repository.js';
import { InviteAlreadyAccepted, InviteExpired, InviteNotFound } from './errors.js';
import type { FirmScope } from './scope.js';

@Controller('invites')
export class InviteController {
  constructor(private readonly invites: InviteRepository) {}

  /** CRUD simples: sem use case (camada sob demanda). */
  @Post()
  async create(
    @CurrentScope() scope: FirmScope,
    @Body(zodPipe(CreateInviteBody)) body: CreateInviteBody,
  ) {
    const { token, tokenHash } = createToken();
    const row = await this.invites.createForFirm(scope, {
      email: body.email,
      tokenHash,
      expiresAt: addDays(new Date(), env.INVITE_TTL_DAYS),
    });

    // o token em claro só existe aqui; a Fatia 6 troca isto por envio de email
    return { id: row.id, email: row.email, url: `${env.WEB_URL}/convite/${token}` };
  }

  @Get(':token')
  @AllowAnonymous()
  async preview(@Param(zodPipe(InviteTokenParam)) params: InviteTokenParam) {
    const row = await this.invites.findByToken(params.token);

    if (!row) throw new InviteNotFound();
    if (row.acceptedAt) throw new InviteAlreadyAccepted();
    if (row.expiresAt < new Date()) throw new InviteExpired();

    return {
      email: row.email,
      invitedBy: row.firmName ?? row.companyName,
      target: row.accountingFirmId ? 'accounting_firm' : 'company',
    };
  }
}

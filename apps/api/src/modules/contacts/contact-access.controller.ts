import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  AcceptContactInviteBody,
  ActivateContactAccessBody,
  IdParam,
  InviteTokenParam,
  PushSubscriptionBody,
} from '@competa/contracts';
import type { Response } from 'express';
import * as z from 'zod';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { AuthProvider } from '../auth/auth-provider.js';
import { EmailAlreadyRegistered, InviteTargetUnsupported } from '../auth/errors.js';
import { InviteRepository } from '../auth/invite.repository.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope, UploadScope } from '../auth/scope.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { CurrentUploadScope } from '../auth/upload-scope.decorator.js';
import { UploadLinkRepository } from '../requests/upload-link.repository.js';
import { ContactRepository } from './contact.repository.js';
import { MessageRepository } from '../messaging/message.repository.js';
import { AccessAlreadyExists } from './errors.js';
import { isFailure } from '../../lib/either.js';
import { APIError } from 'better-auth/api';

@Controller('upload/:token')
@AllowAnonymous()
@UseGuards(UploadTokenGuard)
export class ContactAccessController {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly links: UploadLinkRepository,
    private readonly auth: AuthProvider,
    private readonly messages: MessageRepository,
  ) {}

  /* Limite apertado: é rota pública que cria usuário. */
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post('access')
  async activate(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(ActivateContactAccessBody)) body: ActivateContactAccessBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    const owner = await this.links.findContact(scope);
    if (!owner) throw new NotFound('Solicitação não encontrada.');
    if (owner.authUserId) throw new AccessAlreadyExists();

    /* Email já tem conta de Contador (ou conta sem vínculo de contato) → recusar: o
     * signInPasswordless abaixo logaria NA conta existente e o vínculo entregaria a
     * sessão dela a quem controla o Link (AUTHZ-1). O front manda o dono entrar em
     * /minha-area/acesso. Conta contact-only passa: o token do Link prova posse do email,
     * e o vínculo só ADICIONA esta Empresa ao mesmo Responsável (multi-empresa). */
    const existing = await this.contacts.userByEmail(owner.email);
    if (existing && (existing.isAccountant || !existing.isContact)) {
      throw new EmailAlreadyRegistered();
    }

    const name = body.name?.trim() || owner.name;
    const session = await this.auth.signInPasswordless({ name, email: owner.email });

    await this.contacts.linkAuthUser(owner.id, session.userId);
    // a tela informa que ativar implica no aceite dos Termos/Privacidade
    await this.contacts.markTermsAccepted(session.userId);
    response.setHeader('set-cookie', session.setCookie);

    return { email: owner.email, name };
  }

  @Post('push')
  async subscribe(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(PushSubscriptionBody)) body: PushSubscriptionBody,
  ) {
    return this.messages.savePushSubscription(scope, body);
  }
}

@Controller('invites/:token/contact-account')
@AllowAnonymous()
export class ContactInviteAccountController {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly invites: InviteRepository,
    private readonly auth: AuthProvider,
  ) {}

  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post()
  async accept(
    @Param(zodPipe(InviteTokenParam)) params: InviteTokenParam,
    @Body(zodPipe(AcceptContactInviteBody)) body: AcceptContactInviteBody,
  ) {
    const found = await this.invites.findUsable(params.token);
    if (!found.companyId) throw new InviteTargetUnsupported();

    const owner = await this.contacts.findByEmailInCompany(found.companyId, found.email);
    if (!owner) throw new NotFound('Responsável não encontrado nesta Empresa.');
    if (owner.authUserId) throw new AccessAlreadyExists();

    const name = body.name?.trim() || owner.name;
    const signUp = await this.auth.signUpEmail({
      name,
      email: owner.email,
      password: body.password,
    });

    if (isFailure(signUp)) {
      const duplicate =
        signUp.error instanceof APIError &&
        signUp.error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

      if (duplicate) throw new EmailAlreadyRegistered();
      throw signUp.error;
    }

    await this.contacts.markUserEmailVerified(signUp.value.userId);
    await this.contacts.linkAuthUser(owner.id, signUp.value.userId);
    await this.invites.markAccepted(found.id);

    /* O front entra em seguida com o mesmo email e senha: a sessão não sai daqui para não
     * nascer de um link que circula por email. Da tela, é um passo só. */
    return { email: owner.email, name, nextStep: 'sign_in' as const };
  }
}

const ContactAccessParam = z.object({ id: z.uuid(), contactId: z.uuid() });
type ContactAccessParam = z.infer<typeof ContactAccessParam>;

@Controller('companies/:id/contacts')
export class ContactAccessAdminController {
  constructor(private readonly contacts: ContactRepository) {}

  @Get('access')
  async list(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    if (!(await this.contacts.findOwnedCompany(scope, params.id))) {
      throw new NotFound('Empresa não encontrada.');
    }

    return this.contacts.withAccess(scope, params.id);
  }

  @Delete(':contactId/access')
  async revoke(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(ContactAccessParam)) params: ContactAccessParam,
  ) {
    const result = await this.contacts.revokeAccess(scope, params.id, params.contactId);
    if (!result) throw new NotFound('Responsável não encontrado.');

    return result;
  }
}

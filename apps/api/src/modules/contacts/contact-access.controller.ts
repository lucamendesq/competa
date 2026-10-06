import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  AcceptContactInviteBody,
  ActivateContactAccessBody,
  InviteTokenParam,
  PushSubscriptionBody,
} from '@competa/contracts';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { AuthProvider } from '../auth/auth-provider.js';
import { EmailAlreadyRegistered, InviteTargetUnsupported } from '../auth/errors.js';
import { InviteRepository } from '../auth/invite.repository.js';
import type { UploadScope } from '../auth/scope.js';
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
  ) {
    const owner = await this.links.findContact(scope);
    if (!owner) throw new NotFound('Solicitação não encontrada.');
    if (owner.authUserId) throw new AccessAlreadyExists();

    /* Email já tem conta de Contador (ou conta sem vínculo de contato) → recusar: o
     * vínculo entregaria a conta dela a quem controla o Link (AUTHZ-1). O front manda o
     * dono entrar em /minha-area/acesso. Conta contact-only passa: o vínculo só ADICIONA
     * esta Empresa ao mesmo Responsável (multi-empresa). */
    const existing = await this.contacts.userByEmail(owner.email);
    if (existing && (existing.isAccountant || !existing.isContact)) {
      throw new EmailAlreadyRegistered();
    }

    const name = body.name?.trim() || owner.name;

    /* A conta nasce sem senha utilizável: o acesso só se completa pelo magic link que vai
     * para a caixa do Responsável. Devolver a sessão aqui tornaria o Link de Upload — que
     * circula por email encaminhado, histórico e log de proxy — equivalente à senha,
     * dando a quem o tivesse o acervo inteiro da Empresa por `/my/documents/:id/content`.
     * Mesma regra já aplicada no aceite de convite de Responsável. */
    let userId = existing?.id;
    if (!userId) {
      const created = await this.auth.signUpEmail({
        name,
        email: owner.email,
        password: randomBytes(32).toString('base64url'),
      });
      if (isFailure(created)) {
        const duplicate =
          created.error instanceof APIError &&
          created.error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

        if (duplicate) throw new EmailAlreadyRegistered();
        throw created.error;
      }

      userId = created.value.userId;
      await this.contacts.markUserEmailVerified(userId);
    }

    await this.contacts.linkAuthUser(owner.id, userId);
    // a tela informa que ativar implica no aceite dos Termos/Privacidade
    await this.contacts.markTermsAccepted(userId);
    await this.auth.sendSignInLink(owner.email);

    return { email: owner.email, name, nextStep: 'check_email' as const };
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

    /* Recusa ANTES de queimar o convite: é a falha comum, e queimá-la deixaria o dono do
     * email sem convite e sem conta. */
    if (await this.contacts.userByEmail(owner.email)) throw new EmailAlreadyRegistered();

    /* Claim atômico (`isNull(acceptedAt)` no WHERE) antes de criar a conta: deixar para
     * depois fazia o uso único depender de o signUp detectar email duplicado. */
    await this.invites.markAccepted(found.id);

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

    /* O front entra em seguida com o mesmo email e senha: a sessão não sai daqui para não
     * nascer de um link que circula por email. Da tela, é um passo só. */
    return { email: owner.email, name, nextStep: 'sign_in' as const };
  }
}

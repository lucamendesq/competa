import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth/api';
import { InviteTokenParam, SignUpBody } from '@contabilidade/contracts';
import { NotFound } from '../../lib/app-error.js';
import { isFailure } from '../../lib/either.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { AccountantRepository } from './accountant.repository.js';
import { AuthProvider, type AuthSession } from './auth-provider.js';
import { CurrentScope } from './current-scope.decorator.js';
import { EmailAlreadyRegistered, InviteEmailMismatch, InviteTargetUnsupported } from './errors.js';
import { InviteRepository } from './invite.repository.js';
import type { FirmScope } from './scope.js';
import { Session } from './session.decorator.js';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthProvider,
    private readonly invites: InviteRepository,
    private readonly accountants: AccountantRepository,
  ) {}

  @Post('sign-up')
  @AllowAnonymous()
  async signUp(
    @Query(zodPipe(InviteTokenParam)) query: InviteTokenParam,
    @Body(zodPipe(SignUpBody)) body: SignUpBody,
  ) {
    const found = await this.invites.findUsable(query.token);

    if (found.email.toLowerCase() !== body.email.toLowerCase()) throw new InviteEmailMismatch();

    const { accountingFirmId } = found;
    if (!accountingFirmId) throw new InviteTargetUnsupported();

    const signUp = await this.auth.signUpEmail({
      name: body.name,
      email: body.email,
      password: body.password,
    });

    if (isFailure(signUp)) {
      this.logger.error('Falha ao criar conta no Better Auth', signUp.error);

      const isDuplicateEmail =
        signUp.error instanceof APIError &&
        signUp.error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

      if (!isDuplicateEmail) throw signUp.error;

      throw new EmailAlreadyRegistered();
    }

    const { userId } = signUp.value;

    try {
      await this.accountants.acceptInvite({
        authUserId: userId,
        accountingFirmId,
        inviteId: found.id,
      });

      return { userId };
    } catch (error) {
      try {
        await this.accountants.deleteAuthUser(userId);
      } catch (compensationError) {
        this.logger.error(
          `Falha ao compensar (apagar user ${userId}) após erro no signup`,
          compensationError,
        );
      }

      this.logger.error('Falha ao vincular convite ao accountant', error);
      throw error;
    }
  }

  @Get('/me')
  async me(@CurrentScope() scope: FirmScope, @Session() session: AuthSession) {
    const me = await this.accountants.findMe(scope, session.user.id);
    if (!me) throw new NotFound();

    return {
      accountant: { id: me.accountantId, name: me.name, email: me.email },
      accountingFirm: { id: me.firmId, name: me.firmName },
    };
  }
}

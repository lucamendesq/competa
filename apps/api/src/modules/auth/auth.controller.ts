import { Body, Controller, Get, HttpCode, Logger, Patch, Post, Req } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth/api';
import { RegisterDeviceBody, SignUpBody } from '@competa/contracts';
import type { Request } from 'express';
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
import { SessionRoute } from './session-route.decorator.js';
import { UserDeviceRepository } from './user-device.repository.js';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthProvider,
    private readonly invites: InviteRepository,
    private readonly accountants: AccountantRepository,
    private readonly devices: UserDeviceRepository,
  ) {}

  @Post('sign-up')
  @AllowAnonymous()
  async signUp(@Body(zodPipe(SignUpBody)) body: SignUpBody) {
    const found = await this.invites.findUsable(body.token);

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
      accountant: { id: me.accountantId, name: me.name, email: me.email, owner: me.owner },
      accountingFirm: {
        id: me.firmId,
        name: me.firmName,
        logoUrl: me.firmLogoUrl,
        contactEmail: me.firmContactEmail,
      },
    };
  }

  @Patch('device')
  @SessionRoute()
  @HttpCode(204)
  async device(
    @Session() session: AuthSession,
    @Body(zodPipe(RegisterDeviceBody)) body: RegisterDeviceBody,
    @Req() request: Request,
  ) {
    await this.devices.upsert({
      userId: session.user.id,
      deviceId: body.deviceId,
      platform: body.platform,
      installed: body.installed,
      userAgent: request.headers['user-agent'],
    });
  }
}

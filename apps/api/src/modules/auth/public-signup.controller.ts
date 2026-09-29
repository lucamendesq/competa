import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth/api';
import { PublicSignUpBody } from '@competa/contracts';
import type { Response } from 'express';
import { isFailure } from '../../lib/either.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { AccountantRepository } from './accountant.repository.js';
import { AuthProvider } from './auth-provider.js';
import { EmailAlreadyRegistered } from './errors.js';

@Controller('public-signup')
export class PublicSignupController {
  private readonly logger = new Logger(PublicSignupController.name);

  constructor(
    private readonly auth: AuthProvider,
    private readonly accountants: AccountantRepository,
  ) {}

  @Post()
  @AllowAnonymous()
  async signUp(
    @Body(zodPipe(PublicSignUpBody)) body: PublicSignUpBody,
    @Res({ passthrough: true }) res: Response
  ) {
    if (await this.accountants.userExistsByEmail(body.email)) {
      throw new EmailAlreadyRegistered();
    }

    const signUp = await this.auth.signUpEmail(
      {
        name: body.userName,
        email: body.email,
        password: body.password,
      },
      new Headers()
    );

    if (isFailure(signUp)) {
      this.logger.error('Falha ao criar conta no Better Auth', signUp.error);

      const isDuplicateEmail =
        signUp.error instanceof APIError &&
        signUp.error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

      if (!isDuplicateEmail) throw signUp.error;

      throw new EmailAlreadyRegistered();
    }

    const { userId, setCookie } = signUp.value;

    try {
      await this.accountants.provisionFirm({
        authUserId: userId,
        firmName: body.firmName,
      });

      if (setCookie) {
        res.setHeader('Set-Cookie', setCookie);
      }
      return { userId };
    } catch (error) {
      try {
        await this.accountants.deleteAuthUser(userId);
      } catch (compensationError) {
        this.logger.error(
          `Falha ao compensar (apagar user ${userId}) após erro no public signup`,
          compensationError,
        );
      }

      this.logger.error('Falha ao provisionar firm', error);
      throw error;
    }
  }
}

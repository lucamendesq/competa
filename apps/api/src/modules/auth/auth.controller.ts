import { Body, Controller, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { InviteTokenParam, SignUpBody } from '@contabilidade/contracts';
import { isFailure } from '../../lib/either.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { SignUpUseCase } from './usecases/sign-up.usecase.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly signUpUseCase: SignUpUseCase) {}

  @Post('sign-up')
  @AllowAnonymous()
  async signUp(
    @Query(zodPipe(InviteTokenParam)) query: InviteTokenParam,
    @Body(zodPipe(SignUpBody)) body: SignUpBody,
  ) {
    const result = await this.signUpUseCase.execute({ ...body, token: query.token });

    if (isFailure(result)) throw result.error;

    return result.value;
  }
}

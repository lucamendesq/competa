import { BadRequestException, Body, Controller, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import * as z from 'zod';
import { isFailure } from '../../lib/either.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { SignUpUseCase } from './usecases/SignUpUseCase.js';

const SignUpQuery = z.object({ token: z.string().min(1) });
type SignUpQuery = z.infer<typeof SignUpQuery>;
const SignUpBody = z.object({
  email: z.email(),
  name: z.string().min(1),
  password: z.string().min(1),
});
type SignUpBody = z.infer<typeof SignUpBody>;

@Controller('auth')
export class AuthController {
  constructor(private readonly acceptInviteUseCase: SignUpUseCase) {}

  @Post('sign-up')
  @AllowAnonymous()
  async signUp(
    @Query(zodPipe(SignUpQuery)) query: SignUpQuery,
    @Body(zodPipe(SignUpBody)) body: SignUpBody,
  ) {
    const result = await this.acceptInviteUseCase.execute({
      password: body.password,
      name: body.name,
      email: body.email,
      token: query.token,
    });

    if (isFailure(result)) {
      throw new BadRequestException(result.error);
    }

    return result.value;
  }
}

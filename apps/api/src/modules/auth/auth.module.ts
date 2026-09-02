import { Module } from '@nestjs/common';
import { AuthProvider } from './auth-provider.js';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { AuthController } from './auth.controller.js';
import { InviteController } from './invite.controller.js';
import { InviteRepository } from './invite.repository.js';
import { SignUpUseCase } from './usecases/SignUpUseCase.js';

@Module({
  providers: [
    { provide: AuthProvider, useClass: BetterAuthAdapter },
    SignUpUseCase,
    InviteRepository,
  ],
  exports: [AuthProvider],
  controllers: [AuthController, InviteController],
})
export class AuthModule {}

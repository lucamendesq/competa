import { Module } from '@nestjs/common';
import { AuthProvider } from './auth-provider.js';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { AuthController } from './auth.controller.js';
import { SignUpUseCase } from './usecases/SignUpUseCase.js';

@Module({
  providers: [{ provide: AuthProvider, useClass: BetterAuthAdapter }, SignUpUseCase],
  exports: [AuthProvider],
  controllers: [AuthController],
})
export class AuthModule {}

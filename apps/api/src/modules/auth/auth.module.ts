import { Module } from '@nestjs/common';
import { AuthProvider } from './auth-provider.js';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { AccountantRepository } from './accountant.repository.js';
import { AuthController } from './auth.controller.js';
import { InviteController } from './invite.controller.js';
import { InviteRepository } from './invite.repository.js';

@Module({
  providers: [
    { provide: AuthProvider, useClass: BetterAuthAdapter },
    AccountantRepository,
    InviteRepository,
  ],
  exports: [AuthProvider, InviteRepository],
  controllers: [AuthController, InviteController],
})
export class AuthModule {}

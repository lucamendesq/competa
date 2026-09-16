import { Module } from '@nestjs/common';
import { AuthProvider } from './auth-provider.js';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { AccountantRepository } from './accountant.repository.js';
import { AuthController } from './auth.controller.js';
import { InviteController } from './invite.controller.js';
import { InviteRepository } from './invite.repository.js';
import { SessionGuard } from './session.guard.js';
import { TeamController } from './team.controller.js';
import { UserDeviceRepository } from './user-device.repository.js';

@Module({
  providers: [
    { provide: AuthProvider, useClass: BetterAuthAdapter },
    AccountantRepository,
    InviteRepository,
    UserDeviceRepository,
    SessionGuard,
  ],
  exports: [AuthProvider, InviteRepository, UserDeviceRepository],
  controllers: [AuthController, InviteController, TeamController],
})
export class AuthModule {}


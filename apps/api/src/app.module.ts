import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import auth from './infra/auth/better-auth.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { TenantGuard } from './modules/auth/tenant.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BetterAuthModule.forRoot({
      auth,
      disableControllers: false,
      disableGlobalAuthGuard: false,
      bodyParser: {
        json: { limit: '2mb' },
        urlencoded: { limit: '2mb', extended: true },
        rawBody: true,
      },
    }),
    DatabaseModule,
    AuthModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: TenantGuard }],
})
export class AppModule {}

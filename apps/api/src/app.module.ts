import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import auth from './infra/auth/better-auth.js';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { TenantGuard } from './modules/auth/tenant.guard.js';
import { ChecklistsModule } from './modules/checklists/checklists.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { PeriodsModule } from './modules/periods/periods.module.js';
import { RequestsModule } from './modules/requests/requests.module.js';
import { UploadModule } from './modules/requests/upload.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // eventos síncronos in-process entre módulos (sem fila/outbox na v1)
    EventEmitterModule.forRoot(),
    // cron de lembretes (Fase 5) e de prazo estourado (Fase 6)
    ScheduleModule.forRoot(),
    BetterAuthModule.forRoot({
      auth,
      disableControllers: false,
      disableGlobalAuthGuard: true,
      bodyParser: {
        json: { limit: '2mb' },
        urlencoded: { limit: '2mb', extended: true },
        rawBody: true,
      },
    }),
    DatabaseModule,
    AuthModule,
    ChecklistsModule,
    CompaniesModule,
    PeriodsModule,
    RequestsModule,
    UploadModule,
    MessagingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: TenantGuard }],
})
export class AppModule {}

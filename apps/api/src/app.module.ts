import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import auth from './infra/auth/better-auth.js';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { TenantGuard } from './modules/auth/tenant.guard.js';
import { ChecklistsModule } from './modules/checklists/checklists.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { PeriodsModule } from './modules/periods/periods.module.js';
import { RequestsModule } from './modules/requests/requests.module.js';
import { UploadModule } from './modules/requests/upload.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { ContactsModule } from './modules/contacts/contacts.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    /* Rate limiting. Dois baldes: `short` corta rajada e `default` corta abuso sustentado.
     * A rota pública de upload é a superfície mais exposta (token no email, sem sessão) e
     * tem limite próprio via @Throttle no controller. */
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: seconds(10), limit: 30 },
        { name: 'default', ttl: seconds(60), limit: 120 },
      ],
    }),
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
    ContactsModule,
  ],
  providers: [
    // ordem importa: barra o excesso ANTES de resolver sessão e tocar o banco
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}

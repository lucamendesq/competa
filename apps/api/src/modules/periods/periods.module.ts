import { Module } from '@nestjs/common';
import { ChecklistsModule } from '../checklists/checklists.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { PeriodRepository } from './period.repository.js';
import { PeriodsController } from './periods.controller.js';

@Module({
  imports: [ChecklistsModule, MessagingModule],
  controllers: [PeriodsController],
  providers: [PeriodRepository],
})
export class PeriodsModule {}

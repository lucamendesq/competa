import { Module } from '@nestjs/common';
import { ChecklistsModule } from '../checklists/checklists.module.js';
import { PeriodRepository } from './period.repository.js';
import { PeriodsController } from './periods.controller.js';

@Module({
  imports: [ChecklistsModule],
  controllers: [PeriodsController],
  providers: [PeriodRepository],
  exports: [PeriodRepository],
})
export class PeriodsModule {}

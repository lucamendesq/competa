import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { DeadlineCron } from './deadline.cron.js';
import { DocumentRepository } from './document.repository.js';
import { RemindersCron } from './reminders.cron.js';
import { RequestRepository } from './request.repository.js';
import { RequestsController } from './requests.controller.js';
import { ReviewController } from './review.controller.js';
import { ZipController } from './zip.controller.js';
import { ZipFlightService } from './zip-flight.service.js';

@Module({
  imports: [StorageModule],
  controllers: [RequestsController, ReviewController, ZipController],
  providers: [RequestRepository, DocumentRepository, DeadlineCron, RemindersCron, ZipFlightService],
  exports: [RequestRepository, RemindersCron],
})
export class RequestsModule {}

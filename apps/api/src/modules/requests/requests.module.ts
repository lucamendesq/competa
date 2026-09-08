import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { DeadlineCron } from './deadline.cron.js';
import { DocumentRepository } from './document.repository.js';
import { RequestRepository } from './request.repository.js';
import { RequestsController } from './requests.controller.js';
import { ReviewController } from './review.controller.js';
import { ZipController } from './zip.controller.js';

@Module({
  imports: [StorageModule],
  controllers: [RequestsController, ReviewController, ZipController],
  providers: [RequestRepository, DocumentRepository, DeadlineCron],
  exports: [RequestRepository],
})
export class RequestsModule {}

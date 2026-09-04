import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { DeadlineCron } from './deadline.cron.js';
import { RequestRepository } from './request.repository.js';
import { RequestsController } from './requests.controller.js';
import { ReviewController } from './review.controller.js';
import { ZipController } from './zip.controller.js';

/** Fase 3 — Solicitação, Itens (snapshot) e Link de Upload (lado do painel).
 *  Fase 6 — revisão, encerramento e varredura de prazo.
 *  Fase 7 — entrega em zip (streaming do storage). */
@Module({
  imports: [StorageModule],
  controllers: [RequestsController, ReviewController, ZipController],
  providers: [RequestRepository, DeadlineCron],
  exports: [RequestRepository],
})
export class RequestsModule {}

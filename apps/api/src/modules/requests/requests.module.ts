import { Module } from '@nestjs/common';
import { DeadlineCron } from './deadline.cron.js';
import { RequestRepository } from './request.repository.js';
import { RequestsController } from './requests.controller.js';
import { ReviewController } from './review.controller.js';

/** Fase 3 — Solicitação, Itens (snapshot) e Link de Upload (lado do painel).
 *  Fase 6 — revisão, encerramento e varredura de prazo. */
@Module({
  controllers: [RequestsController, ReviewController],
  providers: [RequestRepository, DeadlineCron],
  exports: [RequestRepository],
})
export class RequestsModule {}

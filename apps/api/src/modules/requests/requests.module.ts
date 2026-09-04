import { Module } from '@nestjs/common';
import { RequestRepository } from './request.repository.js';
import { RequestsController } from './requests.controller.js';

/** Fase 3 — Solicitação, Itens (snapshot) e Link de Upload (lado do painel). */
@Module({
  controllers: [RequestsController],
  providers: [RequestRepository],
  exports: [RequestRepository],
})
export class RequestsModule {}

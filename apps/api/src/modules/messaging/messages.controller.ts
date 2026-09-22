import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { IdParam, MessageListQuery } from '@competa/contracts';
import env from '../../config/env.js';
import { NotFound } from '../../lib/app-error.js';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { MessageRepository } from './message.repository.js';
import { RemindersCron } from '../requests/reminders.cron.js';

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messages: MessageRepository,
    private readonly reminders: RemindersCron,
  ) {}

  @Get()
  async list(
    @CurrentScope() scope: FirmScope,
    @Query(zodPipe(MessageListQuery)) query: MessageListQuery,
  ) {
    const { rows, total } = await this.messages.list(scope, query);

    return paginated(rows, { page: query.page, perPage: query.perPage, total });
  }

  @Get('failures')
  async failures(
    @CurrentScope() scope: FirmScope,
    @Query('periodId') periodId?: string,
  ) {
    if (!periodId) return [];
    return this.messages.failuresByPeriod(scope, periodId);
  }

  @Post(':id/resend')
  async resend(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    const result = await this.messages.resend(scope, params.id);
    if (!result) throw new NotFound('Mensagem não encontrada.');

    return result;
  }

  /** Dispara a varredura de lembretes sob demanda, restrita à Contabilidade do chamador
   *  (AUTHZ-2). A varredura global continua sendo só do cron. */
  @Post('reminders/run')
  runReminders(@CurrentScope() scope: FirmScope) {
    return this.reminders.run(scope);
  }
}

/** A chave pública VAPID vem da API em vez de ser compilada no bundle do front: ela só faz
 *  sentido casada com a privada que vive aqui, e um build antigo com a chave antiga produz
 *  inscrições que o navegador aceita e o servidor nunca consegue usar. Vazia = push
 *  desligado (dev, ou produção sem as chaves) e a UI não oferece o recurso. */
@Controller('push')
@AllowAnonymous()
export class PushKeyController {
  @Get('vapid-key')
  key() {
    return { key: env.VAPID_PUBLIC_KEY ?? '' };
  }
}

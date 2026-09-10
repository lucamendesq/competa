import { Controller, Get, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { MessageListQuery } from '@contabilidade/contracts';
import env from '../../config/env.js';
import { paginated } from '../../lib/response.interceptor.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope } from '../auth/scope.js';
import { MessageRepository } from './message.repository.js';
import { RemindersCron } from './reminders.cron.js';

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

  /** Dispara a varredura de lembretes sob demanda. Existe para operação/verificação
   *  enquanto não há UI. A varredura é global (atende todas as Contabilidades), então
   *  não há `FirmScope` a passar — a sessão exigida pelo TenantGuard global é só a
   *  barreira de acesso. */
  @Post('reminders/run')
  runReminders() {
    return this.reminders.run();
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

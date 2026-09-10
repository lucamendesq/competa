import { Body, Controller, Logger, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Throttle, seconds } from '@nestjs/throttler';
import { RecoverAccessBody } from '@contabilidade/contracts';
import { subMinutes } from 'date-fns';
import env from '../../config/env.js';
import { EVENTS, type UploadLinkResentEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { AuthProvider } from '../auth/auth-provider.js';
import { RequestRepository } from '../requests/request.repository.js';
import { ContactRepository } from './contact.repository.js';

/** Resposta única, para os três desfechos (D14, item 6). Dizer "não encontramos esse
 *  email" entregaria a quem tenta adivinhar um oráculo de quem é cliente de quem. */
const SAME_ANSWER = {
  message: 'Se este email estiver cadastrado, o link de envio chega em instantes.',
} as const;

/** Piso de tempo comum: sem ele, o caso "email desconhecido" (nenhuma query de escrita,
 *  nenhum email) responde em milissegundos e os outros dois em centenas — o relógio
 *  contaria o que a mensagem esconde. */
const MINIMUM_DURATION_MS = 700;

/** Janela em que um pedido novo NÃO gera link novo. Sem ela, qualquer um que saiba o email
 *  do Responsável mantém o link da caixa de entrada dele quebrado: cada pedido rotacionava
 *  o token e matava o que já tinha sido enviado, e 3 req/min bastam. Dentro da janela o
 *  pedido é aceito, responde igual e não faz nada — o link que está na caixa continua
 *  valendo.
 *  ponytail: janela fixa. O certo é confirmar posse do email antes de rotacionar (link de
 *  confirmação em dois passos); isso é tela nova e ficou para depois. */
const RESEND_COOLDOWN_MINUTES = 15;

@Controller('access/recover')
@AllowAnonymous()
export class AccessRecoveryController {
  private readonly logger = new Logger(AccessRecoveryController.name);

  constructor(
    private readonly contacts: ContactRepository,
    private readonly requests: RequestRepository,
    private readonly auth: AuthProvider,
    private readonly events: EventEmitter2,
  ) {}

  /* Rota pública que dispara email: limite por IP, senão vira ferramenta de envio em massa
   * para a caixa de terceiros. */
  @Throttle({ default: { ttl: seconds(60), limit: 3 } })
  @Post()
  async recover(@Body(zodPipe(RecoverAccessBody)) body: RecoverAccessBody) {
    const startedAt = Date.now();

    await this.deliver(body.email.toLowerCase());
    await pauseUntil(startedAt + MINIMUM_DURATION_MS);

    return SAME_ANSWER;
  }

  private async deliver(email: string) {
    const openRequests = await this.contacts.openRequestsForEmail(email);

    /* Quem já tem acesso entra pela conta: o magic link do Better Auth leva à área logada,
     * onde estão o histórico e as Competências anteriores. */
    if (openRequests.some((row) => row.hasAccess)) {
      await this.auth.sendSignInLink(email);
      return;
    }

    const cooldownStart = subMinutes(new Date(), RESEND_COOLDOWN_MINUTES);

    for (const row of openRequests) {
      if (row.lastLinkSentAt && row.lastLinkSentAt > cooldownStart) continue;

      /* O token vai para o email ANTES de virar o token oficial: `applyUploadToken` só
       * grava depois que a entrega confirma. Rotacionar primeiro deixaria o Responsável
       * sem link nenhum toda vez que o provedor de email falhasse. */
      const { token, tokenHash } = createToken();

      const resent: UploadLinkResentEvent = {
        requestId: row.requestId,
        referenceMonth: row.referenceMonth,
        periodDueDate: row.periodDueDate,
        companyName: row.companyName,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        uploadUrl: `${env.WEB_URL}/envio/${token}`,
      };

      /* `emitAsync` e não `emit`: o listener devolve se o email saiu, e sem esperar por
       * ele não haveria o que confirmar. Nenhum `true` = ninguém entregou. */
      const delivered = await this.events.emitAsync(EVENTS.UploadLinkResent, resent);
      if (!delivered.includes(true)) continue;

      const applied = await this.requests.applyUploadToken(row.requestId, tokenHash, row.contactId);

      if (!applied) {
        this.logger.error(`Solicitação ${row.requestId} sem upload_link: link enviado morto.`);
      }
    }
  }
}

const pauseUntil = (deadline: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now())));

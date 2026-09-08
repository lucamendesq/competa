import { Body, Controller, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Throttle, seconds } from '@nestjs/throttler';
import { RecoverAccessBody } from '@contabilidade/contracts';
import env from '../../config/env.js';
import { EVENTS, type UploadLinkResentEvent } from '../../lib/events.js';
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

@Controller('access/recover')
@AllowAnonymous()
export class AccessRecoveryController {
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

    for (const row of openRequests) {
      const token = await this.requests.rotateUploadToken(row.requestId, row.contactId);
      if (!token) continue;

      const resent: UploadLinkResentEvent = {
        requestId: row.requestId,
        referenceMonth: row.referenceMonth,
        periodDueDate: row.periodDueDate,
        companyName: row.companyName,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        uploadUrl: `${env.WEB_URL}/envio/${token}`,
      };

      this.events.emit(EVENTS.UploadLinkResent, resent);
    }
  }
}

const pauseUntil = (deadline: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now())));

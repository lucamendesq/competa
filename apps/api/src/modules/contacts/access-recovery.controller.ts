import { Body, Controller, Logger, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Throttle, seconds } from '@nestjs/throttler';
import { RecoverAccessBody, RecoverAccessConfirmBody } from '@contabilidade/contracts';
import { subMinutes } from 'date-fns';
import env from '../../config/env.js';
import {
  EVENTS,
  type AccessRecoveryRequestedEvent,
  type UploadLinkResentEvent,
} from '../../lib/events.js';
import { createToken, signRecoveryToken, verifyRecoveryToken } from '../../lib/token.js';
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

/** Janela em que uma confirmação nova NÃO gera link novo. Junto com a confirmação em dois
 *  passos, é a segunda barreira: mesmo o dono do email não rotaciona em loop. */
const RESEND_COOLDOWN_MINUTES = 15;

/** Validade do link de confirmação (passo 1 → passo 2). */
const CONFIRM_TTL_MS = 30 * 60 * 1000;

/** "Perdi meu link" em dois passos (AUTHZ-3): o passo 1 NÃO rotaciona nada — envia um
 *  email de confirmação de posse; só o passo 2, com o token desse email, rotaciona e
 *  entrega o link novo. Antes, qualquer um que soubesse o email matava o link vivo do
 *  Responsável. */
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

    await this.requestConfirmation(body.email.toLowerCase());
    await pauseUntil(startedAt + MINIMUM_DURATION_MS);

    return SAME_ANSWER;
  }

  /** Passo 2: o token prova posse do email — aí sim rotaciona. Resposta igualmente cega:
   *  token inválido/expirado responde o mesmo que sucesso. */
  @Throttle({ default: { ttl: seconds(60), limit: 3 } })
  @Post('confirm')
  async confirm(@Body(zodPipe(RecoverAccessConfirmBody)) body: RecoverAccessConfirmBody) {
    const startedAt = Date.now();

    const email = verifyRecoveryToken(body.token);
    if (email) await this.rotateAndSend(email);

    await pauseUntil(startedAt + MINIMUM_DURATION_MS);

    return SAME_ANSWER;
  }

  private async requestConfirmation(email: string) {
    const openRequests = await this.contacts.openRequestsForEmail(email);
    if (!openRequests.length) return;

    /* Quem já tem acesso entra pela conta: o magic link do Better Auth leva à área logada
     * e JÁ é prova de posse do email — dois passos aqui seriam três no total. */
    if (openRequests.some((row) => row.hasAccess)) {
      await this.auth.sendSignInLink(email);
      return;
    }

    const token = signRecoveryToken(email, CONFIRM_TTL_MS);
    const requested: AccessRecoveryRequestedEvent = {
      email,
      contactName: openRequests[0].contactName,
      confirmUrl: `${env.WEB_URL}/perdi-meu-link/confirmar?token=${token}`,
    };

    await this.events.emitAsync(EVENTS.AccessRecoveryRequested, requested);
  }

  private async rotateAndSend(email: string) {
    const openRequests = await this.contacts.openRequestsForEmail(email);
    const cooldownStart = subMinutes(new Date(), RESEND_COOLDOWN_MINUTES);

    for (const row of openRequests) {
      /* new Date(): o subquery cru devolve string, e `string > Date` é sempre false — o
       * cooldown nunca segurava. */
      if (row.lastLinkSentAt && new Date(row.lastLinkSentAt) > cooldownStart) continue;

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

import { Logger } from '../../lib/logger.js';
import { RecoverAccessBody, RecoverAccessConfirmBody } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { handler } from '../../http/envelope.js';
import { body, publicRoute, route } from '../../http/platform.js';
import { throttleDefault } from '../../http/throttle.js';
import {
  EVENTS,
  type AccessRecoveryRequestedEvent,
  type UploadLinkResentEvent,
} from '../../lib/events.js';
import { Events } from '../../lib/events.service.js';
import {
  createToken,
  recoveryFingerprint,
  signRecoveryToken,
  verifyRecoveryToken,
} from '../../lib/token.js';
import { ContactsRepo } from './contact.repo.js';
import { RequestsRepo } from '../requests/request.repo.js';

const logger = new Logger('AccessRecoveryController');
const auth = new BetterAuthAdapter();

/** Resposta única, para os três desfechos (D14, item 6). Dizer "não encontramos esse
 *  email" entregaria a quem tenta adivinhar um oráculo de quem é cliente de quem. */
const SAME_ANSWER = {
  message: 'Se este email estiver cadastrado, o link de envio chega em instantes.',
} as const;

/** Piso de tempo comum: sem ele, o caso "email desconhecido" (nenhuma query de escrita,
 *  nenhum email) responde em milissegundos e os outros dois em centenas — o relógio
 *  contaria o que a mensagem esconde. */
const MINIMUM_DURATION_MS = 700;

/** Validade do link de confirmação (passo 1 → passo 2). */
const CONFIRM_TTL_MS = 30 * 60 * 1000;

/* Rota pública que dispara email: limite por IP, senão vira ferramenta de envio em massa
 * para a caixa de terceiros. */
const RECOVERY_THROTTLE = throttleDefault(3, 60_000);

const pauseUntil = (deadline: number) =>
  Effect.promise(
    () => new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()))),
  );

type OpenRequests = Effect.Success<ReturnType<ContactsRepo['Service']['openRequestsForEmail']>>;

const openRequestsForEmail = (email: string) =>
  ContactsRepo.use((repo) => repo.openRequestsForEmail(email));

const requestConfirmation = (email: string) =>
  Effect.gen(function* () {
    const events = yield* Events;
    const openRequests = yield* openRequestsForEmail(email);
    if (!openRequests.length) return;

    /* Quem já tem acesso entra pela conta: o magic link do Better Auth leva à área logada
     * e JÁ é prova de posse do email — dois passos aqui seriam três no total. */
    if (openRequests.some((row) => row.hasAccess)) {
      yield* Effect.promise(() => auth.sendSignInLink(email));
      return;
    }

    const token = signRecoveryToken(email, recoveryFingerprint(openRequests), CONFIRM_TTL_MS);
    const requested: AccessRecoveryRequestedEvent = {
      email,
      contactName: openRequests[0].contactName,
      confirmUrl: `${env.WEB_URL}/perdi-meu-link/confirmar?token=${token}`,
    };

    yield* events.emitAsync(EVENTS.AccessRecoveryRequested, requested);
  });

/** Rotação sem janela de tempo, de propósito: a posse do email já está provada pelo token
 *  HMAC do passo 2, que é de uso único (a rotação troca os hashes e o fingerprint deixa de
 *  bater). O freio contra pedir em loop é o passo 1, anônimo e com limite por IP. */
const rotateAndSend = (openRequests: OpenRequests) =>
  Effect.gen(function* () {
    const events = yield* Events;
    for (const row of openRequests) {
      /* Só o Link que foi enviado a ESTE Responsável. Com dois Responsáveis na Empresa, o
       * segundo pegava o Link do principal (o `contactId` da rotação o reatribuía) e o
       * token do principal morria sem carência. */
      if (row.uploadLinkContactId !== row.contactId) continue;

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

      const delivered = yield* events.emitAsync(EVENTS.UploadLinkResent, resent);
      if (!delivered.includes(true)) {
        logger.warn(`Recuperação: e-mail da Solicitação ${row.requestId} não saiu; link mantido.`);
        continue;
      }

      const applied = yield* RequestsRepo.use((repo) =>
        repo.applyUploadToken(row.requestId, tokenHash, row.contactId, { revokePrevious: true }),
      );

      if (!applied) {
        logger.error(`Solicitação ${row.requestId} sem upload_link: link enviado morto.`);
      }
    }
  });

const recover = route(
  'POST',
  '/access/recover',
  handler(
    'POST',
    Effect.gen(function* () {
      const input = yield* body(RecoverAccessBody);
      const startedAt = Date.now();

      yield* requestConfirmation(input.email.toLowerCase());
      yield* pauseUntil(startedAt + MINIMUM_DURATION_MS);

      return SAME_ANSWER;
    }),
  ),
  { auth: publicRoute, throttle: RECOVERY_THROTTLE },
);

/** Passo 2: o token prova posse do email — aí sim rotaciona. Resposta igualmente cega:
 *  token inválido/expirado responde o mesmo que sucesso. */
const confirm = route(
  'POST',
  '/access/recover/confirm',
  handler(
    'POST',
    Effect.gen(function* () {
      const input = yield* body(RecoverAccessConfirmBody);
      const startedAt = Date.now();

      const confirmed = verifyRecoveryToken(input.token);
      if (confirmed) {
        const openRequests = yield* openRequestsForEmail(confirmed.email);

        /* Uso único sem tabela: o token foi assinado sobre os Links vigentes naquele
         * momento. A rotação troca esses hashes, então o mesmo token não confirma duas
         * vezes. */
        if (recoveryFingerprint(openRequests) === confirmed.fingerprint) {
          yield* rotateAndSend(openRequests);
        }
      }

      yield* pauseUntil(startedAt + MINIMUM_DURATION_MS);

      return SAME_ANSWER;
    }),
  ),
  { auth: publicRoute, throttle: RECOVERY_THROTTLE },
);

export const accessRecoveryRoutes = Layer.mergeAll(recover, confirm);

import { Logger } from '../../lib/logger.js';
import { Context, Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { squashError } from '../../infra/database/error.js';
import { brazilDay } from '../../lib/brazil-time.js';
import { EVENTS, type DeadlineMissedEvent } from '../../lib/events.js';
import { Events } from '../../lib/events.service.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { subHours, subYears } from 'date-fns';
import * as Sentry from '@sentry/node';
import { storage } from '../../infra/storage/storage.js';
import { DocumentsRepo } from './document.repo.js';
import { effectiveDueDate } from './review-rules.js';
import { RequestsRepo } from './request.repo.js';

/** Presign sem PUT: janela generosa porque o cliente pode estar subindo 500 arquivos
 *  grandes numa conexão ruim. */
const STALE_UPLOAD_HOURS = 24;

const DEADLINE_CRON_LEASE = 'deadline-sweep';

const logger = new Logger('DeadlineCron');

/** Varredura de prazo estourado: emite UM `DeadlineMissed` por Solicitação, com todos os
 *  Itens vencidos dela (avisa Responsável E Contador).
 *
 *  "Já avisei este item" é `request_item.deadline_notified_at` (e não estado em memória):
 *  reiniciar a API não pode reavisar o cliente. A reabertura do Item limpa a marca, então
 *  um prazo estourado de novo volta a avisar. */
const make = Effect.gen(function* () {
  const events = yield* Events;
  const requests = yield* RequestsRepo;
  const documents = yield* DocumentsRepo;

  /** Sem agendamento de propósito: nada no produto tem 5 anos ainda. Chamada manual até
   *  o primeiro documento se aproximar do prazo — ver `retention.md`. */
  const purgeExpiredFiscalDocuments = () =>
    Effect.gen(function* () {
      const fiveYearsAgo = subYears(new Date(), 5);
      const expired = yield* documents.expiredFiscalDocuments(fiveYearsAgo, 1000);
      if (!expired.length) return 0;

      yield* Effect.promise(() =>
        Promise.all(
          expired.map((row) =>
            storage.remove(row.storageKey).catch((error: unknown) => {
              logger.warn(
                `Falha ao remover arquivo expirado ${row.storageKey} do storage: ${String(error)}`,
              );
            }),
          ),
        ),
      );

      yield* documents.purgeFiscalDocuments(expired.map((row) => row.id));
      logger.log(`Expurgo fiscal: ${expired.length} documento(s) com mais de 5 anos removido(s).`);

      return expired.length;
    });

  const discardStaleUploads = () =>
    Effect.gen(function* () {
      const stale = yield* documents.staleAwaitingUpload(subHours(new Date(), STALE_UPLOAD_HOURS));
      if (!stale.length) return 0;

      yield* documents.discard(stale.map((row) => row.id));
      yield* Effect.promise(() =>
        Promise.all(
          stale.map((row) =>
            storage.remove(row.storageKey).catch((error: unknown) => {
              logger.warn(
                `Falha ao remover arquivo órfão ${row.storageKey} do storage: ${String(error)}`,
              );
            }),
          ),
        ),
      );

      return stale.length;
    });

  const scanUnlocked = (scope: FirmScope | null) =>
    Effect.gen(function* () {
      const today = brazilDay();
      const overdue = yield* requests.overdueItems(scope, today);
      const pendingNotice = overdue.filter((row) => row.deadlineNotifiedAt === null);

      const emailsByFirm = yield* requests.accountantEmails([
        ...new Set(pendingNotice.map((row) => row.accountingFirmId)),
      ]);

      const byRequest = pendingNotice.reduce((groups, row) => {
        groups.set(row.requestId, [...(groups.get(row.requestId) ?? []), row]);
        return groups;
      }, new Map<string, typeof pendingNotice>());

      const notified: {
        requestItemId: string;
        itemName: string;
        companyName: string;
        dueDate: string;
      }[] = [];

      for (const [requestId, rows] of byRequest) {
        yield* Effect.gen(function* () {
          const link = createToken();
          const head = rows[0];

          const missed: DeadlineMissedEvent = {
            requestId,
            companyName: head.companyName,
            contactName: head.contactName,
            contactEmail: head.contactEmail,
            uploadUrl: `${env.WEB_URL}/envio/${link.token}`,
            accountantEmails: emailsByFirm.get(head.accountingFirmId) ?? [],
            overdueItems: rows.map((row) => ({
              name: row.itemName,
              dueDate: effectiveDueDate(row)!,
            })),
          };

          /* O token só passa a valer (`applyUploadToken`) depois que a entrega confirma, e a
           * marca de "já avisei" vem junto: rotacionar ou marcar antes deixaria o Responsável
           * sem link nenhum — e sem nova tentativa — quando o provedor de email estivesse fora
           * do ar. */
          const [delivered] = yield* events.emitAsync(EVENTS.DeadlineMissed, missed);

          if (!delivered) {
            logger.warn(`Solicitação ${requestId}: aviso de prazo não entregue ao Responsável.`);
            return;
          }

          if (!(yield* requests.applyUploadToken(requestId, link.tokenHash))) {
            logger.error(`Solicitação ${requestId} sem upload_link: link enviado morto.`);
            return;
          }

          yield* requests.markDeadlineNotified(rows.map((row) => row.requestItemId));

          notified.push(
            ...rows.map((row, index) => ({
              requestItemId: row.requestItemId,
              itemName: row.itemName,
              companyName: row.companyName,
              dueDate: missed.overdueItems[index].dueDate,
            })),
          );
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              const error = squashError(cause);
              logger.error(`Erro ao processar a Solicitação vencida ${requestId}`, error);
              Sentry.captureException(error);
            }),
          ),
        );
      }

      return {
        overdue: overdue.length,
        alreadyNotified: overdue.length - pendingNotice.length,
        notified,
      };
    });

  /** Voo único por escopo, compartilhado pela rota e pelo cron: duas varreduras em paralelo
   *  liam o mesmo `deadline_notified_at IS NULL`, avisavam em dobro e a segunda rotação de
   *  token matava o link do primeiro email. `null` = outra varredura do escopo em andamento. */
  const scan = (scope: FirmScope | null) =>
    requests.withLease(
      scope === null ? DEADLINE_CRON_LEASE : `${DEADLINE_CRON_LEASE}:${scope}`,
      scanUnlocked(scope),
    );

  /** Agendada em `crons.ts` (`0 7 * * *`, America/Sao_Paulo) e chamada à mão pelo
   *  `runDeadlineSweep()` do handle de `createApp`. */
  const daily = () =>
    Effect.gen(function* () {
      const scanned = yield* scan(null);
      if (!scanned) {
        logger.warn('prazos: varredura pulada — lock tomado por outra instância');
        return;
      }

      const discarded = yield* discardStaleUploads();
      logger.log(
        `prazos: ${scanned.notified.length} de ${scanned.overdue} item(ns) vencido(s) avisado(s); faxina: ${discarded} envio(s) não confirmado(s) removido(s)`,
      );
    });

  return { daily, scan, discardStaleUploads, purgeExpiredFiscalDocuments };
});

export class DeadlineScan extends Context.Service<DeadlineScan, Effect.Success<typeof make>>()(
  'competa/api/requests/DeadlineScan',
) {
  static readonly layer = Layer.effect(DeadlineScan, make);
}

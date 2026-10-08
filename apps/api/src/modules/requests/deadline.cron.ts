import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SentryCron } from '@sentry/nestjs';
import env from '../../config/env.js';
import { brazilDay } from '../../lib/brazil-time.js';
import { EVENTS, type DeadlineMissedEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { subHours, subYears } from 'date-fns';
import * as Sentry from '@sentry/nestjs';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { DocumentRepository } from './document.repository.js';
import { effectiveDueDate } from './review-rules.js';
import { RequestRepository } from './request.repository.js';

/** Presign sem PUT: janela generosa porque o cliente pode estar subindo 500 arquivos
 *  grandes numa conexão ruim. */
const STALE_UPLOAD_HOURS = 24;

const DEADLINE_CRON_LOCK_ID = 42002;

/** Varredura de prazo estourado: emite UM `DeadlineMissed` por Solicitação, com todos os
 *  Itens vencidos dela (avisa Responsável E Contador).
 *
 *  "Já avisei este item" é `request_item.deadline_notified_at` (e não estado em memória):
 *  reiniciar a API não pode reavisar o cliente. A reabertura do Item limpa a marca, então
 *  um prazo estourado de novo volta a avisar. */
@Injectable()
export class DeadlineCron {
  private readonly logger = new Logger(DeadlineCron.name);

  constructor(
    private readonly requests: RequestRepository,
    private readonly documents: DocumentRepository,
    private readonly storage: StorageProvider,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM, { timeZone: 'America/Sao_Paulo' })
  @SentryCron('deadline-daily', {
    schedule: { type: 'crontab', value: '0 7 * * *' },
    checkinMargin: 5,
    maxRuntime: 30,
    timezone: 'America/Sao_Paulo',
  })
  async daily() {
    const ran = await this.requests.withAdvisoryLock(DEADLINE_CRON_LOCK_ID, async () => {
      const { overdue, notified } = await this.scan(null);
      const discarded = await this.discardStaleUploads();

      this.logger.log(
        `prazos: ${notified.length} de ${overdue} item(ns) vencido(s) avisado(s); faxina: ${discarded} envio(s) não confirmado(s) removido(s)`,
      );
      return true;
    });

    if (!ran) this.logger.warn('prazos: varredura pulada — lock tomado por outra instância');
  }

  /** Sem agendamento de propósito: nada no produto tem 5 anos ainda. Chamada manual até
   *  o primeiro documento se aproximar do prazo — ver `retention.md`. */
  async purgeExpiredFiscalDocuments() {
    const fiveYearsAgo = subYears(new Date(), 5);
    const expired = await this.documents.expiredFiscalDocuments(fiveYearsAgo, 1000);
    if (!expired.length) return 0;

    await Promise.all(
      expired.map((row) =>
        this.storage.remove(row.storageKey).catch((error) => {
          this.logger.warn(
            `Falha ao remover arquivo expirado ${row.storageKey} do storage: ${String(error)}`,
          );
        }),
      ),
    );

    await this.documents.purgeFiscalDocuments(expired.map((row) => row.id));
    this.logger.log(
      `Expurgo fiscal: ${expired.length} documento(s) com mais de 5 anos removido(s).`,
    );
    return expired.length;
  }

  async discardStaleUploads() {
    const stale = await this.documents.staleAwaitingUpload(
      subHours(new Date(), STALE_UPLOAD_HOURS),
    );
    if (!stale.length) return 0;

    await this.documents.discard(stale.map((row) => row.id));
    await Promise.all(
      stale.map((row) =>
        this.storage.remove(row.storageKey).catch((error) => {
          this.logger.warn(
            `Falha ao remover arquivo órfão ${row.storageKey} do storage: ${String(error)}`,
          );
        }),
      ),
    );

    return stale.length;
  }

  async scan(scope: FirmScope | null) {
    const today = brazilDay();
    const overdue = await this.requests.overdueItems(scope, today);
    const pendingNotice = overdue.filter((row) => row.deadlineNotifiedAt === null);

    const emailsByFirm = await this.requests.accountantEmails([
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
      try {
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
        const [delivered] = await this.events.emitAsync(EVENTS.DeadlineMissed, missed);

        if (!delivered) {
          this.logger.warn(`Solicitação ${requestId}: aviso de prazo não entregue ao Responsável.`);
          continue;
        }

        if (!(await this.requests.applyUploadToken(requestId, link.tokenHash))) {
          this.logger.error(`Solicitação ${requestId} sem upload_link: link enviado morto.`);
          continue;
        }

        await this.requests.markDeadlineNotified(rows.map((row) => row.requestItemId));

        notified.push(
          ...rows.map((row, index) => ({
            requestItemId: row.requestItemId,
            itemName: row.itemName,
            companyName: row.companyName,
            dueDate: missed.overdueItems[index].dueDate,
          })),
        );
      } catch (error) {
        this.logger.error(`Erro ao processar a Solicitação vencida ${requestId}`, error);
        Sentry.captureException(error);
      }
    }

    return {
      overdue: overdue.length,
      alreadyNotified: overdue.length - pendingNotice.length,
      notified,
    };
  }
}

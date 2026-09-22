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

/** Varredura de prazo estourado: emite `DeadlineMissed` (avisa Responsável E Contador).
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
    await this.requests.withAdvisoryLock(DEADLINE_CRON_LOCK_ID, async () => {
      const { notified } = await this.scan(null);
      if (notified.length)
        this.logger.log(`Prazo estourado: ${notified.length} item(ns) avisado(s).`);

      const discarded = await this.discardStaleUploads();
      if (discarded) this.logger.log(`Faxina: ${discarded} envio(s) não confirmado(s) removido(s).`);
    });
  }

  @Cron('0 3 1 * *', { timeZone: 'America/Sao_Paulo' })
  @SentryCron('fiscal-retention-monthly', {
    schedule: { type: 'crontab', value: '0 3 1 * *' },
    checkinMargin: 5,
    maxRuntime: 60,
    timezone: 'America/Sao_Paulo',
  })
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
    this.logger.log(`Expurgo fiscal: ${expired.length} documento(s) com mais de 5 anos removido(s).`);
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

    /* Um token por Solicitação por varredura: rotacionar por item deixaria o email do item
     * anterior com um link já morto. E o token só passa a valer (`applyUploadToken`) depois
     * que a primeira entrega confirma — rotacionar antes deixaria o Responsável sem link
     * nenhum quando o provedor de email estivesse fora do ar. */
    const linkByRequest = new Map<string, { token: string; tokenHash: string }>();
    const applied = new Set<string>();
    const notified: {
      requestItemId: string;
      itemName: string;
      companyName: string;
      dueDate: string;
    }[] = [];

    for (const row of pendingNotice) {
      try {
        const link = linkByRequest.get(row.requestId) ?? createToken();
        linkByRequest.set(row.requestId, link);

        const missed: DeadlineMissedEvent = {
          requestId: row.requestId,
          requestItemId: row.requestItemId,
          itemName: row.itemName,
          dueDate: effectiveDueDate(row)!,
          companyName: row.companyName,
          contactName: row.contactName,
          contactEmail: row.contactEmail,
          uploadUrl: `${env.WEB_URL}/envio/${link.token}`,
          accountantEmails: emailsByFirm.get(row.accountingFirmId) ?? [],
        };

        await this.events.emitAsync(EVENTS.DeadlineMissed, missed);

        if (!applied.has(row.requestId)) {
          if (!(await this.requests.applyUploadToken(row.requestId, link.tokenHash))) {
            this.logger.error(`Solicitação ${row.requestId} sem upload_link: link enviado morto.`);
            continue;
          }

          applied.add(row.requestId);
        }

        await this.requests.markDeadlineNotified([row.requestItemId]);

        notified.push({
          requestItemId: row.requestItemId,
          itemName: row.itemName,
          companyName: row.companyName,
          dueDate: missed.dueDate,
        });
      } catch (error) {
        this.logger.error(`Erro ao processar item vencido ${row.requestItemId}`, error);
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

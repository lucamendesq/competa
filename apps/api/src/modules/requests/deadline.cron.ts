import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { format } from 'date-fns';
import env from '../../config/env.js';
import { EVENTS, type DeadlineMissedEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { subHours } from 'date-fns';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { DocumentRepository } from './document.repository.js';
import { effectiveDueDate } from './review-rules.js';
import { RequestRepository } from './request.repository.js';

/** Presign sem PUT: janela generosa porque o cliente pode estar subindo 500 arquivos
 *  grandes numa conexão ruim. */
const STALE_UPLOAD_HOURS = 24;

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

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async daily() {
    const { notified } = await this.scan(null);
    if (notified.length)
      this.logger.log(`Prazo estourado: ${notified.length} item(ns) avisado(s).`);

    const discarded = await this.discardStaleUploads();
    if (discarded) this.logger.log(`Faxina: ${discarded} envio(s) não confirmado(s) removido(s).`);
  }

  async discardStaleUploads() {
    const stale = await this.documents.staleAwaitingUpload(
      subHours(new Date(), STALE_UPLOAD_HOURS),
    );
    if (!stale.length) return 0;

    await this.documents.discard(stale.map((row) => row.id));
    await Promise.all(
      stale.map((row) => this.storage.remove(row.storageKey).catch(() => undefined)),
    );

    return stale.length;
  }

  async scan(scope: FirmScope | null) {
    const today = format(new Date(), 'yyyy-MM-dd');
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

      /* `emitAsync` e não `emit`: só marca `deadline_notified_at` o item cujo email
       * REALMENTE saiu. Marcar antes de confirmar a entrega faz um provedor de email fora
       * do ar virar contato nunca avisado — a marca é idempotente e a varredura de amanhã
       * pula o item para sempre. */
      const delivered = await this.events.emitAsync(EVENTS.DeadlineMissed, missed);
      if (!delivered.includes(true)) {
        this.logger.warn(`Prazo de "${row.itemName}" não avisado: o email não saiu.`);
        continue;
      }

      if (!applied.has(row.requestId)) {
        if (!(await this.requests.applyUploadToken(row.requestId, link.tokenHash))) {
          this.logger.error(`Solicitação ${row.requestId} sem upload_link: link enviado morto.`);
          continue;
        }

        applied.add(row.requestId);
      }

      notified.push({
        requestItemId: row.requestItemId,
        itemName: row.itemName,
        companyName: row.companyName,
        dueDate: missed.dueDate,
      });
    }

    if (notified.length) {
      await this.requests.markDeadlineNotified(notified.map((row) => row.requestItemId));
    }

    return {
      overdue: overdue.length,
      alreadyNotified: overdue.length - pendingNotice.length,
      notified,
    };
  }
}

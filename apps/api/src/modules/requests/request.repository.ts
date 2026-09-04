import { Injectable } from '@nestjs/common';
import { addDays } from 'date-fns';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import env from '../../config/env.js';
import { Database } from '../../infra/database/database.js';
import {
  accountant,
  company,
  contact,
  document,
  period,
  request,
  requestItem,
  uploadLink,
  user,
} from '../../infra/database/schema/index.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { InvalidTransition } from './errors.js';
import {
  acceptItemRefusal,
  missedDeadline,
  rejectDocumentRefusal,
  requestStatusAfterReview,
  type ItemStatus,
  type RequestStatus,
  type ReviewStatus,
} from './review-rules.js';

/** A transação do Drizzle, do jeito que `db.transaction()` a entrega. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class RequestRepository {
  constructor(private readonly db: Database) {}

  /** `request` só é alcançável pelo join até `period` da Contabilidade da sessão —
   *  Solicitação de outro tenant simplesmente não existe para esta consulta. */
  async findById(scope: FirmScope, requestId: string) {
    const [row] = await this.db
      .select({
        id: request.id,
        status: request.status,
        closedAt: request.closedAt,
        companyId: company.id,
        companyName: company.name,
        periodId: period.id,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;

    const items = await this.db
      .select({
        id: requestItem.id,
        name: requestItem.name,
        description: requestItem.description,
        status: requestItem.status,
        dueDate: requestItem.dueDate,
        acceptedFormats: requestItem.acceptedFormats,
      })
      .from(requestItem)
      .where(eq(requestItem.requestId, requestId))
      .orderBy(requestItem.name);

    /** Painel do Contador (autenticado): aqui os Documentos aparecem. A proibição de
     *  listar documentos vale para as rotas do `UploadTokenGuard`, outro fluxo. */
    const documents = await this.db
      .select({
        id: document.id,
        requestItemId: document.requestItemId,
        fileName: document.fileName,
        sizeBytes: document.sizeBytes,
        uploadedAt: document.uploadedAt,
        reviewStatus: document.reviewStatus,
        rejectionReason: document.rejectionReason,
      })
      .from(document)
      .where(eq(document.requestId, requestId))
      .orderBy(asc(document.uploadedAt));

    return {
      ...row,
      items: items.map((item) => ({
        ...item,
        documents: documents.filter((row) => row.requestItemId === item.id),
      })),
      extraDocuments: documents.filter((row) => !row.requestItemId),
    };
  }

  /** Revisão em lote: aceitar o Item aceita todos os seus Documentos numa tacada
   *  (invariante do domínio). Documento já rejeitado permanece rejeitado — é histórico da
   *  revisão anterior, e `rejected → accepted` não é transição prevista. */
  async acceptItem(scope: FirmScope, requestItemId: string) {
    const context = await this.itemContext(scope, requestItemId);
    if (!context) return undefined;

    const refusal = acceptItemRefusal(context);
    if (refusal) throw new InvalidTransition(refusal);

    return this.db.transaction(async (tx) => {
      const accepted = await tx
        .update(document)
        .set({ reviewStatus: 'accepted' })
        .where(
          and(
            eq(document.requestItemId, requestItemId),
            eq(document.reviewStatus, 'pending'),
          ),
        )
        .returning({ id: document.id });

      await tx
        .update(requestItem)
        .set({ status: 'accepted' })
        .where(eq(requestItem.id, requestItemId));

      const requestStatus = await this.syncRequestStatus(tx, context.requestId);

      return {
        requestId: context.requestId,
        requestItemId,
        itemName: context.itemName,
        acceptedDocuments: accepted.length,
        requestStatus,
        completed: requestStatus === 'complete' && context.requestStatus !== 'complete',
        companyName: context.companyName,
        contactName: context.contactName,
        contactEmail: context.contactEmail,
      };
    });
  }

  /** Rejeitar é por Documento e reabre o Item (`rejected → pending`). O token do Link é
   *  rotacionado aqui: o token em claro só existe neste instante e viaja no evento
   *  `ItemReopened` para a Fase 5 reenviar SÓ por email. */
  async rejectDocument(scope: FirmScope, documentId: string, reason: string) {
    const [row] = await this.db
      .select({
        documentId: document.id,
        requestItemId: document.requestItemId,
        reviewStatus: document.reviewStatus,
        fileName: document.fileName,
        requestId: request.id,
        requestStatus: request.status,
        companyName: company.name,
        uploadLinkId: uploadLink.id,
        contactName: contact.name,
        contactEmail: contact.email,
      })
      .from(document)
      .innerJoin(request, eq(request.id, document.requestId))
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .leftJoin(uploadLink, eq(uploadLink.requestId, request.id))
      .leftJoin(contact, eq(contact.id, uploadLink.contactId))
      .where(and(eq(document.id, documentId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;

    const refusal = rejectDocumentRefusal({
      requestStatus: row.requestStatus as RequestStatus,
      reviewStatus: row.reviewStatus as ReviewStatus,
      requestItemId: row.requestItemId,
    });
    if (refusal) throw new InvalidTransition(refusal);

    // O fan-out sempre cria o Link; sem ele não há como reabrir sem deixar o Responsável
    // sem caminho de reenvio.
    if (!row.uploadLinkId) {
      throw new InvalidTransition(
        'Esta solicitação não tem Link de Upload: não é possível reabrir o item.',
      );
    }

    const [itemName] = await this.db
      .select({ name: requestItem.name })
      .from(requestItem)
      .where(eq(requestItem.id, row.requestItemId!))
      .limit(1);

    const { token, tokenHash } = createToken();

    const requestStatus = await this.db.transaction(async (tx) => {
      await tx
        .update(document)
        .set({ reviewStatus: 'rejected', rejectionReason: reason })
        .where(eq(document.id, documentId));

      // limpa a marca do cron: prazo que estourar de novo neste Item volta a avisar
      await tx
        .update(requestItem)
        .set({ status: 'pending', deadlineNotifiedAt: null })
        .where(eq(requestItem.id, row.requestItemId!));

      await tx
        .update(uploadLink)
        .set({ tokenHash, expiresAt: addDays(new Date(), env.UPLOAD_LINK_TTL_DAYS) })
        .where(eq(uploadLink.id, row.uploadLinkId!));

      return this.syncRequestStatus(tx, row.requestId);
    });

    return {
      requestId: row.requestId,
      requestItemId: row.requestItemId!,
      itemName: itemName?.name ?? '',
      fileName: row.fileName,
      rejectionReason: reason,
      requestStatus,
      companyName: row.companyName,
      contactName: row.contactName ?? '',
      contactEmail: row.contactEmail ?? '',
      token,
    };
  }

  /** Encerrar é ato exclusivo do Contador e vale mesmo com pendências — o controller
   *  devolve quantos itens ficaram para trás como aviso. */
  async closeRequest(scope: FirmScope, requestId: string) {
    const [row] = await this.db
      .select({ id: request.id, status: request.status })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;
    if (row.status === 'closed') throw new InvalidTransition('Esta solicitação já foi encerrada.');

    const [pending] = await this.db
      .select({ value: count() })
      .from(requestItem)
      .where(and(eq(requestItem.requestId, requestId), ne(requestItem.status, 'accepted')));

    const [closed] = await this.db
      .update(request)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(request.id, requestId))
      .returning({ id: request.id, status: request.status, closedAt: request.closedAt });

    return { ...closed, pendingItemCount: pending.value };
  }

  /** Itens vencidos de Competência/Solicitação abertas. `scope` nulo = varredura do cron,
   *  que é multi-tenant por natureza (cada evento carrega só os dados da sua
   *  Contabilidade); a rota HTTP passa o escopo da sessão. */
  async overdueItems(scope: FirmScope | null, today: string) {
    const rows = await this.db
      .select({
        accountingFirmId: period.accountingFirmId,
        requestId: request.id,
        requestItemId: requestItem.id,
        itemName: requestItem.name,
        status: requestItem.status,
        dueDate: requestItem.dueDate,
        periodDueDate: period.dueDate,
        companyName: company.name,
        contactName: contact.name,
        contactEmail: contact.email,
        uploadLinkId: uploadLink.id,
        deadlineNotifiedAt: requestItem.deadlineNotifiedAt,
      })
      .from(requestItem)
      .innerJoin(request, eq(request.id, requestItem.requestId))
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .innerJoin(uploadLink, eq(uploadLink.requestId, request.id))
      .innerJoin(contact, eq(contact.id, uploadLink.contactId))
      .where(
        and(
          eq(period.status, 'open'),
          eq(request.status, 'open'),
          inArray(requestItem.status, ['pending', 'rejected']),
          scope ? eq(period.accountingFirmId, scope) : undefined,
        ),
      )
      .orderBy(asc(company.name), asc(requestItem.name));

    return rows.filter((row) =>
      missedDeadline(
        { status: row.status as ItemStatus, dueDate: row.dueDate, periodDueDate: row.periodDueDate },
        today,
      ),
    );
  }

  /** Emails dos Contadores das Contabilidades donas (join `accountant` → `user`), para o
   *  `DeadlineMissed` avisar os dois lados. */
  async accountantEmails(accountingFirmIds: string[]) {
    if (!accountingFirmIds.length) return new Map<string, string[]>();

    const rows = await this.db
      .select({ accountingFirmId: accountant.accountingFirmId, email: user.email })
      .from(accountant)
      .innerJoin(user, eq(user.id, accountant.authUserId))
      .where(inArray(accountant.accountingFirmId, accountingFirmIds));

    return rows.reduce((byFirm, row) => {
      byFirm.set(row.accountingFirmId, [...(byFirm.get(row.accountingFirmId) ?? []), row.email]);
      return byFirm;
    }, new Map<string, string[]>());
  }

  /** Rotaciona o token do Link e devolve o token em claro (só existe aqui). O `requestId`
   *  vem sempre de uma consulta já escopada. */
  async rotateUploadToken(requestId: string) {
    const { token, tokenHash } = createToken();

    const [row] = await this.db
      .update(uploadLink)
      .set({ tokenHash, expiresAt: addDays(new Date(), env.UPLOAD_LINK_TTL_DAYS) })
      .where(eq(uploadLink.requestId, requestId))
      .returning({ id: uploadLink.id });

    return row ? token : undefined;
  }

  private async itemContext(scope: FirmScope, requestItemId: string) {
    const [row] = await this.db
      .select({
        itemStatus: requestItem.status,
        itemName: requestItem.name,
        requestId: request.id,
        requestStatus: request.status,
        companyName: company.name,
        contactName: contact.name,
        contactEmail: contact.email,
      })
      .from(requestItem)
      .innerJoin(request, eq(request.id, requestItem.requestId))
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .leftJoin(uploadLink, eq(uploadLink.requestId, request.id))
      .leftJoin(contact, eq(contact.id, uploadLink.contactId))
      .where(and(eq(requestItem.id, requestItemId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;

    return {
      ...row,
      itemStatus: row.itemStatus as ItemStatus,
      requestStatus: row.requestStatus as RequestStatus,
      contactName: row.contactName ?? '',
      contactEmail: row.contactEmail ?? '',
    };
  }

  /** `request.status` é derivado dos Itens (`complete` automático e reversível): grava
   *  dentro da mesma transação da revisão para não existir estado intermediário. */
  private async syncRequestStatus(tx: Tx, requestId: string) {
    const items = await tx
      .select({ status: requestItem.status })
      .from(requestItem)
      .where(eq(requestItem.requestId, requestId));

    const [current] = await tx
      .select({ status: request.status })
      .from(request)
      .where(eq(request.id, requestId))
      .limit(1);

    const next = requestStatusAfterReview(
      current.status as RequestStatus,
      items.map((item) => item.status as ItemStatus),
    );

    if (next !== current.status) {
      await tx.update(request).set({ status: next }).where(eq(request.id, requestId));
    }

    return next;
  }

  /** Marca os Itens já avisados: idempotência do cron de prazo sobrevive a restart. */
  async markDeadlineNotified(requestItemIds: string[]) {
    if (requestItemIds.length === 0) return;

    await this.db
      .update(requestItem)
      .set({ deadlineNotifiedAt: new Date() })
      .where(inArray(requestItem.id, requestItemIds));
  }
}

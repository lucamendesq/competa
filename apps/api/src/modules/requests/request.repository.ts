import { Injectable } from '@nestjs/common';
import { addDays, addHours } from 'date-fns';
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
import { NotFound } from '../../lib/app-error.js';
import { InvalidTransition } from './errors.js';
import {
  acceptItemRefusal,
  reviewExtraRefusal,
  undoAcceptRefusal,
  missedDeadline,
  rejectDocumentRefusal,
  requestStatusAfterReview,
  type ItemStatus,
  type RequestStatus,
  type ReviewStatus,
} from './review-rules.js';

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

    const documents = await this.db
      .select({
        id: document.id,
        requestItemId: document.requestItemId,
        fileName: document.fileName,
        sizeBytes: document.sizeBytes,
        uploadedAt: document.uploadedAt,
        reviewStatus: document.reviewStatus,
        rejectionReason: document.rejectionReason,
        uploadedByContactId: document.uploadedByContactId,
      })
      .from(document)
      // documento em `awaiting_upload` é linha de presign sem arquivo no storage: não
      // aparece na revisão, no zip nem no painel
      .where(and(eq(document.requestId, requestId), eq(document.uploadStatus, 'uploaded')))
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

  async acceptItem(scope: FirmScope, requestItemId: string, reviewedBy: string) {
    const context = await this.itemContext(scope, requestItemId);
    if (!context) return undefined;

    const refusal = acceptItemRefusal(context);
    if (refusal) throw new InvalidTransition(refusal);

    return this.db.transaction(async (tx) => {
      const accepted = await tx
        .update(document)
        .set({ reviewStatus: 'accepted', reviewedBy, reviewedAt: new Date() })
        .where(
          and(
            eq(document.requestItemId, requestItemId),
            eq(document.reviewStatus, 'pending'),
            eq(document.uploadStatus, 'uploaded'),
          ),
        )
        .returning({ id: document.id });

      const [updated] = await tx
        .update(requestItem)
        .set({ status: 'accepted' })
        .where(and(eq(requestItem.id, requestItemId), eq(requestItem.status, 'submitted')))
        .returning({ id: requestItem.id });

      if (!updated) throw new InvalidTransition('Este item já foi aceito.');

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
  async rejectDocument(scope: FirmScope, documentId: string, reason: string, reviewedBy: string) {
    const [row] = await this.db
      .select({
        documentId: document.id,
        requestItemId: document.requestItemId,
        reviewStatus: document.reviewStatus,
        uploadStatus: document.uploadStatus,
        fileName: document.fileName,
        requestId: request.id,
        requestStatus: request.status,
        companyName: company.name,
        uploadLinkId: uploadLink.id,
        uploadLinkTokenHash: uploadLink.tokenHash,
        uploadLinkExpiresAt: uploadLink.expiresAt,
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

    // mesma guarda do Extra: linha de presign sem arquivo no storage não é documento para
    // revisar — rejeitá-la rotacionaria o Link e mandaria email de recusa de um envio que
    // nunca chegou.
    if (row.uploadStatus !== 'uploaded') {
      throw new InvalidTransition('Este documento ainda não foi enviado ao storage.');
    }

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
      /* Condicional, não check-then-act: duas revisões concorrentes no mesmo documento
       * serializam aqui — a segunda encontra 0 linhas e vira 422, em vez de rotacionar o
       * link de novo por cima de uma decisão já tomada (AUTHZ-5). */
      const rejected = await tx
        .update(document)
        .set({ reviewStatus: 'rejected', rejectionReason: reason, reviewedBy, reviewedAt: new Date() })
        .where(and(eq(document.id, documentId), ne(document.reviewStatus, 'rejected')))
        .returning({ id: document.id });

      if (!rejected.length) throw new InvalidTransition('Este documento já foi rejeitado.');

      // limpa a marca do cron: prazo que estourar de novo neste Item volta a avisar
      await tx
        .update(requestItem)
        .set({ status: 'pending', deadlineNotifiedAt: null })
        .where(eq(requestItem.id, row.requestItemId!));

      const now = new Date();
      const graceExpiresAt = row.uploadLinkExpiresAt
        ? new Date(Math.min(row.uploadLinkExpiresAt.getTime(), addHours(now, 48).getTime()))
        : null;

      await tx
        .update(uploadLink)
        .set({
          tokenHash,
          expiresAt: addDays(now, env.UPLOAD_LINK_TTL_DAYS),
          ...(row.uploadLinkTokenHash
            ? {
                previousTokenHash: row.uploadLinkTokenHash,
                previousExpiresAt: graceExpiresAt,
              }
            : {}),
        })
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

  /** Revisão em lote: aceites e rejeições de uma tela inteira em UMA transação, com UM
   *  Link rotacionado no fim. O Contador que rejeita cinco documentos mandava cinco
   *  emails; agora sai um evento só (`ReviewPublished`).
   *
   *  Tudo ou nada de propósito: o Contador marcou as decisões antes de publicar, então
   *  uma decisão inválida no meio (item já aceito por outra aba, solicitação encerrada
   *  enquanto ele revisava) recusa o lote inteiro em vez de aplicar metade e deixá-lo
   *  adivinhando o que passou. As regras são as mesmas das rotas unitárias — este método
   *  não reimplementa transição nenhuma, só as aplica em bloco. */
  async applyReview(
    scope: FirmScope,
    requestId: string,
    input: {
      acceptItemIds: string[];
      rejectDocuments: { documentId: string; rejectionReason: string }[];
      reviewExtras: { documentId: string; decision: ReviewStatus; rejectionReason?: string }[];
    },
    reviewedBy: string,
  ) {
    const [head] = await this.db
      .select({
        requestId: request.id,
        requestStatus: request.status,
        companyName: company.name,
        uploadLinkId: uploadLink.id,
        uploadLinkTokenHash: uploadLink.tokenHash,
        uploadLinkExpiresAt: uploadLink.expiresAt,
        contactName: contact.name,
        contactEmail: contact.email,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .leftJoin(uploadLink, eq(uploadLink.requestId, request.id))
      .leftJoin(contact, eq(contact.id, uploadLink.contactId))
      .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!head) return undefined;

    const requestStatus = head.requestStatus as RequestStatus;
    const documentIds = [
      ...input.rejectDocuments.map((row) => row.documentId),
      ...input.reviewExtras.map((row) => row.documentId),
    ];

    const items = input.acceptItemIds.length
      ? await this.db
          .select({ id: requestItem.id, name: requestItem.name, status: requestItem.status })
          .from(requestItem)
          .where(
            and(eq(requestItem.requestId, requestId), inArray(requestItem.id, input.acceptItemIds)),
          )
      : [];

    const documents = documentIds.length
      ? await this.db
          .select({
            id: document.id,
            requestItemId: document.requestItemId,
            fileName: document.fileName,
            reviewStatus: document.reviewStatus,
            uploadStatus: document.uploadStatus,
            itemName: requestItem.name,
          })
          .from(document)
          .leftJoin(requestItem, eq(requestItem.id, document.requestItemId))
          .where(and(eq(document.requestId, requestId), inArray(document.id, documentIds)))
      : [];

    const itemById = new Map(items.map((row) => [row.id, row]));
    const documentById = new Map(documents.map((row) => [row.id, row]));

    // Id que não pertence a esta Solicitação é 404, não conflito: pode ser documento de
    // outra empresa, e o painel não deveria ter oferecido a decisão.
    for (const itemId of input.acceptItemIds) {
      if (!itemById.has(itemId)) throw new NotFound('Item não encontrado nesta solicitação.');
    }
    for (const documentId of documentIds) {
      if (!documentById.has(documentId)) {
        throw new NotFound('Documento não encontrado nesta solicitação.');
      }
    }

    const refuse = (reason: string | null) => {
      if (reason) throw new InvalidTransition(reason);
    };

    for (const item of items) {
      refuse(acceptItemRefusal({ requestStatus, itemStatus: item.status as ItemStatus }));
    }

    for (const row of input.rejectDocuments) {
      const found = documentById.get(row.documentId)!;

      refuse(
        rejectDocumentRefusal({
          requestStatus,
          reviewStatus: found.reviewStatus as ReviewStatus,
          requestItemId: found.requestItemId,
        }),
      );

      // mesma guarda das rotas unitárias: linha de presign sem arquivo no storage não é
      // documento para revisar — rejeitá-la mandaria recusa de um envio que nunca chegou.
      if (found.uploadStatus !== 'uploaded') {
        throw new InvalidTransition('Este documento ainda não foi enviado ao storage.');
      }
    }

    for (const row of input.reviewExtras) {
      const found = documentById.get(row.documentId)!;

      if (found.requestItemId) {
        throw new InvalidTransition('Este documento pertence a um Item: revise-o pelo Item.');
      }

      refuse(
        reviewExtraRefusal({
          requestStatus,
          reviewStatus: found.reviewStatus as ReviewStatus,
        }),
      );

      if (found.uploadStatus !== 'uploaded') {
        throw new InvalidTransition('Este documento ainda não foi enviado ao storage.');
      }
    }

    // Só rejeição de Item reabre e invalida o Link. Rejeitar Extra não reabre nada, e o
    // link que o Responsável tem continua servindo — rotacionar ali seria puni-lo.
    const reopens = input.rejectDocuments.length > 0;

    if (reopens && !head.uploadLinkId) {
      throw new InvalidTransition(
        'Esta solicitação não tem Link de Upload: não é possível reabrir o item.',
      );
    }

    const rotated = reopens ? createToken() : undefined;

    const applied = await this.db.transaction(async (tx) => {
      for (const itemId of input.acceptItemIds) {
        await tx
          .update(document)
          .set({ reviewStatus: 'accepted', reviewedBy, reviewedAt: new Date() })
          .where(
            and(
              eq(document.requestItemId, itemId),
              eq(document.reviewStatus, 'pending'),
              eq(document.uploadStatus, 'uploaded'),
            ),
          );

        const [updated] = await tx
          .update(requestItem)
          .set({ status: 'accepted' })
          .where(and(eq(requestItem.id, itemId), eq(requestItem.status, 'submitted')))
          .returning({ id: requestItem.id });

        if (!updated) throw new InvalidTransition('Este item já foi aceito.');
      }

      for (const row of input.rejectDocuments) {
        const found = documentById.get(row.documentId)!;

        await tx
          .update(document)
          .set({
            reviewStatus: 'rejected',
            rejectionReason: row.rejectionReason,
            reviewedBy,
            reviewedAt: new Date(),
          })
          .where(eq(document.id, row.documentId));

        // limpa a marca do cron: prazo que estourar de novo neste Item volta a avisar
        await tx
          .update(requestItem)
          .set({ status: 'pending', deadlineNotifiedAt: null })
          .where(eq(requestItem.id, found.requestItemId!));
      }

      for (const row of input.reviewExtras) {
        await tx
          .update(document)
          .set({
            reviewStatus: row.decision,
            rejectionReason: row.decision === 'rejected' ? (row.rejectionReason ?? null) : null,
            reviewedBy,
            reviewedAt: new Date(),
          })
          .where(eq(document.id, row.documentId));
      }

      if (rotated) {
        const now = new Date();
        const graceExpiresAt = head.uploadLinkExpiresAt
          ? new Date(Math.min(head.uploadLinkExpiresAt.getTime(), addHours(now, 48).getTime()))
          : null;

        await tx
          .update(uploadLink)
          .set({
            tokenHash: rotated.tokenHash,
            expiresAt: addDays(now, env.UPLOAD_LINK_TTL_DAYS),
            ...(head.uploadLinkTokenHash
              ? {
                  previousTokenHash: head.uploadLinkTokenHash,
                  previousExpiresAt: graceExpiresAt,
                }
              : {}),
          })
          .where(eq(uploadLink.id, head.uploadLinkId!));
      }

      return this.syncRequestStatus(tx, requestId);
    });

    return {
      requestId,
      requestStatus: applied,
      completed: applied === 'complete' && requestStatus !== 'complete',
      companyName: head.companyName,
      contactName: head.contactName ?? '',
      contactEmail: head.contactEmail ?? '',
      acceptedItemNames: input.acceptItemIds.map((itemId) => itemById.get(itemId)!.name),
      rejected: [
        ...input.rejectDocuments.map((row) => ({
          itemName: documentById.get(row.documentId)!.itemName,
          fileName: documentById.get(row.documentId)!.fileName,
          rejectionReason: row.rejectionReason,
        })),
        ...input.reviewExtras
          .filter((row) => row.decision === 'rejected')
          .map((row) => ({
            itemName: null,
            fileName: documentById.get(row.documentId)!.fileName,
            rejectionReason: row.rejectionReason!,
          })),
      ],
      token: rotated?.token,
    };
  }

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
        {
          status: row.status as ItemStatus,
          dueDate: row.dueDate,
          periodDueDate: row.periodDueDate,
        },
        today,
      ),
    );
  }

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

  /** Persiste um token já gerado. Existe separado do `rotateUploadToken` para quem precisa
   *  MONTAR a mensagem com o link novo e só oficializar a troca depois de o envio dar
   *  certo — rotacionar antes deixaria o Responsável sem link nenhum se o email falhasse. */
  async applyUploadToken(requestId: string, tokenHash: string, contactId?: string) {
    const [current] = await this.db
      .select({ tokenHash: uploadLink.tokenHash, expiresAt: uploadLink.expiresAt })
      .from(uploadLink)
      .where(eq(uploadLink.requestId, requestId))
      .limit(1);

    const now = new Date();
    const graceExpiresAt = current
      ? new Date(Math.min(current.expiresAt.getTime(), addHours(now, 48).getTime()))
      : null;

    const [row] = await this.db
      .update(uploadLink)
      .set({
        tokenHash,
        expiresAt: addDays(now, env.UPLOAD_LINK_TTL_DAYS),
        ...(current
          ? {
              previousTokenHash: current.tokenHash,
              previousExpiresAt: graceExpiresAt,
            }
          : {}),
        // reaponta o Link para quem pediu — ver `rotateUploadToken`
        ...(contactId ? { contactId } : {}),
      })
      .where(eq(uploadLink.requestId, requestId))
      .returning({ id: uploadLink.id });

    return Boolean(row);
  }

  /** `contactId` reaponta o Link para quem pediu. Sem isso, o segundo Responsável de uma
   *  Empresa que usa o "perdi meu link" recebe um Link que continua sendo do primeiro, e
   *  tudo que ele enviar entra no histórico com a autoria do outro
   *  (`document.uploaded_by_contact_id` vem do `upload_link`). */
  async rotateUploadToken(requestId: string, contactId?: string) {
    const { token, tokenHash } = createToken();

    const [current] = await this.db
      .select({ tokenHash: uploadLink.tokenHash, expiresAt: uploadLink.expiresAt })
      .from(uploadLink)
      .where(eq(uploadLink.requestId, requestId))
      .limit(1);

    const now = new Date();
    const graceExpiresAt = current
      ? new Date(Math.min(current.expiresAt.getTime(), addHours(now, 48).getTime()))
      : null;

    const [row] = await this.db
      .update(uploadLink)
      .set({
        tokenHash,
        expiresAt: addDays(now, env.UPLOAD_LINK_TTL_DAYS),
        ...(current
          ? {
              previousTokenHash: current.tokenHash,
              previousExpiresAt: graceExpiresAt,
            }
          : {}),
        ...(contactId ? { contactId } : {}),
      })
      .where(eq(uploadLink.requestId, requestId))
      .returning({ id: uploadLink.id });

    return row ? token : undefined;
  }

  /** Reenvio/cópia pelo Contador: contexto e rotação juntos, com o escopo no join. O
   *  `rotateUploadToken` cru não tem escopo — só serve à rota pública de recuperação, onde
   *  a entrada é o email. Solicitação encerrada não recebe link novo. */
  async rotateUploadLink(scope: FirmScope, requestId: string) {
    const [row] = await this.db
      .select({
        requestStatus: request.status,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
        companyName: company.name,
        contactName: contact.name,
        contactEmail: contact.email,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .innerJoin(uploadLink, eq(uploadLink.requestId, request.id))
      .innerJoin(contact, eq(contact.id, uploadLink.contactId))
      .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;
    if (row.requestStatus === 'closed') {
      throw new InvalidTransition('Solicitação encerrada — não há mais link de envio.');
    }

    const token = await this.rotateUploadToken(requestId);
    if (!token) return undefined;

    return { ...row, token };
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

  async markDeadlineNotified(requestItemIds: string[]) {
    if (requestItemIds.length === 0) return;

    await this.db
      .update(requestItem)
      .set({ deadlineNotifiedAt: new Date() })
      .where(inArray(requestItem.id, requestItemIds));
  }

  async documentsForRequestZip(scope: FirmScope, requestId: string) {
    const [head] = await this.db
      .select({
        companyName: company.name,
        referenceMonth: period.referenceMonth,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!head) return undefined;

    const documents = await this.db
      .select({
        storageKey: document.storageKey,
        fileName: document.fileName,
        itemName: requestItem.name,
        companyName: company.name,
        reviewStatus: document.reviewStatus,
      })
      .from(document)
      .innerJoin(request, eq(request.id, document.requestId))
      .innerJoin(company, eq(company.id, request.companyId))
      .leftJoin(requestItem, eq(requestItem.id, document.requestItemId))
      .where(and(eq(document.requestId, requestId), eq(document.uploadStatus, 'uploaded')))
      .orderBy(asc(requestItem.name), asc(document.uploadedAt));

    return { ...head, documents };
  }

  /** Um documento para leitura no painel (preview/baixar avulso). Mesmo join de escopo do
   *  zip: documento de outra Contabilidade não é alcançado e a rota responde 404.
   *  `awaiting_upload` fica de fora — a linha existe, o objeto no storage não. */
  async documentForRead(scope: FirmScope, documentId: string) {
    const [row] = await this.db
      .select({
        storageKey: document.storageKey,
        fileName: document.fileName,
        contentType: document.contentType,
      })
      .from(document)
      .innerJoin(request, eq(request.id, document.requestId))
      .innerJoin(period, eq(period.id, request.periodId))
      .where(
        and(
          eq(document.id, documentId),
          eq(period.accountingFirmId, scope),
          eq(document.uploadStatus, 'uploaded'),
        ),
      )
      .limit(1);

    return row;
  }

  async documentsForPeriodZip(scope: FirmScope, periodId: string) {
    const [head] = await this.db
      .select({ referenceMonth: period.referenceMonth })
      .from(period)
      .where(and(eq(period.id, periodId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!head) return undefined;

    const documents = await this.db
      .select({
        storageKey: document.storageKey,
        fileName: document.fileName,
        itemName: requestItem.name,
        companyName: company.name,
        reviewStatus: document.reviewStatus,
      })
      .from(document)
      .innerJoin(request, eq(request.id, document.requestId))
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .leftJoin(requestItem, eq(requestItem.id, document.requestItemId))
      .where(
        and(
          eq(request.periodId, periodId),
          eq(period.accountingFirmId, scope),
          eq(document.uploadStatus, 'uploaded'),
        ),
      )
      .orderBy(asc(company.name), asc(requestItem.name), asc(document.uploadedAt));

    return { ...head, documents };
  }

  /** #8 — Documento Extra é revisável individualmente (não há Item para revisar em lote).
   *  Aceitar/rejeitar Extra não mexe em `request_item` nem no `complete`: Extra não é
   *  exigência do checklist. Rejeitar Extra também não reenvia link — não há item reaberto. */
  async reviewExtraDocument(
    scope: FirmScope,
    documentId: string,
    decision: { reviewStatus: 'accepted' | 'rejected'; rejectionReason?: string },
    reviewedBy: string,
  ) {
    const [row] = await this.db
      .select({
        id: document.id,
        fileName: document.fileName,
        reviewStatus: document.reviewStatus,
        requestItemId: document.requestItemId,
        uploadStatus: document.uploadStatus,
        requestStatus: request.status,
      })
      .from(document)
      .innerJoin(request, eq(request.id, document.requestId))
      .innerJoin(period, eq(period.id, request.periodId))
      .where(and(eq(document.id, documentId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;
    if (row.requestItemId) {
      throw new InvalidTransition(
        'Este documento pertence a um item: aceite pelo item (em lote) ou rejeite pelo documento.',
      );
    }
    if (row.uploadStatus !== 'uploaded') {
      throw new InvalidTransition('Este documento ainda não foi enviado ao storage.');
    }

    const refusal = reviewExtraRefusal({
      requestStatus: row.requestStatus as RequestStatus,
      reviewStatus: row.reviewStatus as ReviewStatus,
    });
    if (refusal) throw new InvalidTransition(refusal);

    const [updated] = await this.db
      .update(document)
      .set({
        reviewStatus: decision.reviewStatus,
        rejectionReason: decision.rejectionReason ?? null,
        reviewedBy,
        reviewedAt: new Date(),
      })
      // condicional (AUTHZ-5): decisão concorrente no mesmo Extra não sobrescreve a primeira
      .where(and(eq(document.id, documentId), eq(document.reviewStatus, 'pending')))
      .returning({
        id: document.id,
        fileName: document.fileName,
        reviewStatus: document.reviewStatus,
        rejectionReason: document.rejectionReason,
      });

    if (!updated) throw new InvalidTransition('Este documento já foi revisado.');

    return updated;
  }

  async undoAcceptItem(scope: FirmScope, requestItemId: string) {
    const context = await this.itemContext(scope, requestItemId);
    if (!context) return undefined;

    const refusal = undoAcceptRefusal(context);
    if (refusal) throw new InvalidTransition(refusal);

    return this.db.transaction(async (tx) => {
      const reverted = await tx
        .update(document)
        .set({ reviewStatus: 'pending', reviewedBy: null, reviewedAt: null })
        .where(
          and(
            eq(document.requestItemId, requestItemId),
            eq(document.reviewStatus, 'accepted'),
            eq(document.uploadStatus, 'uploaded'),
          ),
        )
        .returning({ id: document.id });

      const itemStatus = reverted.length > 0 ? 'submitted' : 'pending';

      await tx
        .update(requestItem)
        .set({ status: itemStatus })
        .where(eq(requestItem.id, requestItemId));

      const requestStatus = await this.syncRequestStatus(tx, context.requestId);

      return {
        requestId: context.requestId,
        requestItemId,
        itemName: context.itemName,
        itemStatus,
        revertedDocuments: reverted.length,
        requestStatus,
      };
    });
  }
}

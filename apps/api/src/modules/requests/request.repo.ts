import { randomUUID } from 'node:crypto';
import { Context, Effect, Layer } from 'effect';
import { addDays, addHours } from 'date-fns';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import env from '../../config/env.js';
import { planAllows } from '@competa/contracts';
import { Db, type Executor } from '../../infra/database/effect.js';
import {
  accountant,
  accountingFirm,
  company,
  contact,
  cronLease,
  document,
  message,
  period,
  request,
  requestItem,
  subscription,
  uploadLink,
  user,
} from '../../infra/database/schema/index.js';
import { createToken } from '../../lib/token.js';
import { companyIdsOf, type ContactScope, type FirmScope } from '../auth/scope.js';
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderCandidate,
  type ReminderSettings,
} from '../messaging/reminder-rules.js';
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

/** Teto de quanto uma varredura pode segurar a lease. Generoso de propósito: só existe para
 *  que uma instância morta no meio do caminho não bloqueie as próximas para sempre. */
const LEASE_TTL_SECONDS = 30 * 60;

const make = Effect.gen(function* () {
  const db = yield* Db;

  const itemContextOn = async (d: Executor, scope: FirmScope, requestItemId: string) => {
    const [row] = await d
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
  };

  /** Reabrir Item mata o token anterior NA HORA: zerar `previous_token_hash` faz o
   *  `UploadTokenGuard` não ter como resolver o link velho, e ele passa a responder 404.
   *  A carência de 48h de lembrete/reenvio não vale aqui — o Contador acabou de agir SOBRE
   *  o link e a resposta promete `linkRotated: true`. Não usar `revoked`: a flag vale para
   *  a LINHA inteira, derrubaria junto o token que acabou de ser emitido e ninguém a
   *  reseta. */
  const rotateLinkOnReopenOn = async (tx: Executor, uploadLinkId: string, tokenHash: string) => {
    await tx
      .update(uploadLink)
      .set({
        tokenHash,
        expiresAt: addDays(new Date(), env.UPLOAD_LINK_TTL_DAYS),
        /* Zerado de propósito, e não com o token anterior + 48h de carência: a carência é do
         * lembrete e do reenvio, onde o Responsável pode ter o link velho aberto. Aqui o
         * Contador acabou de agir SOBRE o link e a resposta promete `linkRotated: true` —
         * deixar o antigo valendo mais 48h é exatamente o que a promessa nega. */
        previousTokenHash: null,
        previousExpiresAt: null,
      })
      .where(eq(uploadLink.id, uploadLinkId));
  };

  /** `request.status` é derivado dos Itens (`complete` automático e reversível): grava
   *  dentro da mesma transação da revisão para não existir estado intermediário. */
  const syncRequestStatusOn = async (tx: Executor, requestId: string) => {
    const items = await tx
      .select({ status: requestItem.status, required: requestItem.required })
      .from(requestItem)
      .where(eq(requestItem.requestId, requestId));

    const [current] = await tx
      .select({ status: request.status })
      .from(request)
      .where(eq(request.id, requestId))
      .limit(1);

    const next = requestStatusAfterReview(
      current.status as RequestStatus,
      items.map((item) => ({ status: item.status as ItemStatus, required: item.required })),
    );

    if (next !== current.status) {
      await tx.update(request).set({ status: next }).where(eq(request.id, requestId));
    }

    return next;
  };

  /** `request` só é alcançável pelo join até `period` da Contabilidade da sessão —
   *  Solicitação de outro tenant simplesmente não existe para esta consulta. */
  const findById = Effect.fn('RequestsRepo.findById')(function* (
    scope: FirmScope,
    requestId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
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

      const items = await d
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

      const documents = await d
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
    });
  });

  const acceptItem = Effect.fn('RequestsRepo.acceptItem')(function* (
    scope: FirmScope,
    requestItemId: string,
    reviewedBy: string,
  ) {
    const context = yield* db.use((d) => itemContextOn(d, scope, requestItemId));
    if (!context) return undefined;

    const refusal = acceptItemRefusal(context);
    if (refusal) return yield* Effect.fail(new InvalidTransition(refusal));

    return yield* db.withTransaction(
      Effect.gen(function* () {
        const accepted = yield* db.use((tx) =>
          tx
            .update(document)
            .set({ reviewStatus: 'accepted', reviewedBy, reviewedAt: new Date() })
            .where(
              and(
                eq(document.requestItemId, requestItemId),
                eq(document.reviewStatus, 'pending'),
                eq(document.uploadStatus, 'uploaded'),
              ),
            )
            .returning({ id: document.id }),
        );

        const [updated] = yield* db.use((tx) =>
          tx
            .update(requestItem)
            .set({ status: 'accepted' })
            .where(and(eq(requestItem.id, requestItemId), eq(requestItem.status, 'submitted')))
            .returning({ id: requestItem.id }),
        );

        if (!updated) return yield* new InvalidTransition('Este item já foi aceito.');

        const requestStatus = yield* db.use((tx) => syncRequestStatusOn(tx, context.requestId));

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
      }),
    );
  });

  /** Rejeitar é por Documento e reabre o Item (`rejected → pending`). O token do Link é
   *  rotacionado aqui: o token em claro só existe neste instante e viaja no evento
   *  `ItemReopened` para a Fase 5 reenviar SÓ por email. */
  const rejectDocument = Effect.fn('RequestsRepo.rejectDocument')(function* (
    scope: FirmScope,
    documentId: string,
    reason: string,
    reviewedBy: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
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
        .limit(1),
    );

    if (!row) return undefined;

    const refusal = rejectDocumentRefusal({
      requestStatus: row.requestStatus as RequestStatus,
      reviewStatus: row.reviewStatus as ReviewStatus,
      requestItemId: row.requestItemId,
    });
    if (refusal) return yield* Effect.fail(new InvalidTransition(refusal));

    // mesma guarda do Extra: linha de presign sem arquivo no storage não é documento para
    // revisar — rejeitá-la rotacionaria o Link e mandaria email de recusa de um envio que
    // nunca chegou.
    if (row.uploadStatus !== 'uploaded') {
      return yield* Effect.fail(
        new InvalidTransition('Este documento ainda não foi enviado ao storage.'),
      );
    }

    // O fan-out sempre cria o Link; sem ele não há como reabrir sem deixar o Responsável
    // sem caminho de reenvio.
    if (!row.uploadLinkId) {
      return yield* Effect.fail(
        new InvalidTransition(
          'Esta solicitação não tem Link de Upload: não é possível reabrir o item.',
        ),
      );
    }

    const [itemName] = yield* db.use((d) =>
      d
        .select({ name: requestItem.name })
        .from(requestItem)
        .where(eq(requestItem.id, row.requestItemId!))
        .limit(1),
    );

    const { token, tokenHash } = createToken();

    const requestStatus = yield* db.withTransaction(
      Effect.gen(function* () {
        /* Condicional, não check-then-act: duas revisões concorrentes no mesmo documento
         * serializam aqui — a segunda encontra 0 linhas e vira 422, em vez de rotacionar o
         * link de novo por cima de uma decisão já tomada (AUTHZ-5). */
        const rejected = yield* db.use((tx) =>
          tx
            .update(document)
            .set({
              reviewStatus: 'rejected',
              rejectionReason: reason,
              reviewedBy,
              reviewedAt: new Date(),
            })
            .where(and(eq(document.id, documentId), eq(document.reviewStatus, 'pending')))
            .returning({ id: document.id }),
        );

        if (!rejected.length) {
          return yield* new InvalidTransition(
            'Este documento já foi revisado ou não está pendente.',
          );
        }

        return yield* db.use(async (tx) => {
          // limpa a marca do cron: prazo que estourar de novo neste Item volta a avisar
          await tx
            .update(requestItem)
            .set({ status: 'pending', deadlineNotifiedAt: null })
            .where(eq(requestItem.id, row.requestItemId!));

          await rotateLinkOnReopenOn(tx, row.uploadLinkId!, tokenHash);

          return syncRequestStatusOn(tx, row.requestId);
        });
      }),
    );

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
  });

  /** Revisão em lote: aceites e rejeições de uma tela inteira em UMA transação, com UM
   *  Link rotacionado no fim. O Contador que rejeita cinco documentos mandava cinco
   *  emails; agora sai um evento só (`ReviewPublished`).
   *
   *  Tudo ou nada de propósito: o Contador marcou as decisões antes de publicar, então
   *  uma decisão inválida no meio (item já aceito por outra aba, solicitação encerrada
   *  enquanto ele revisava) recusa o lote inteiro em vez de aplicar metade e deixá-lo
   *  adivinhando o que passou. As regras são as mesmas das rotas unitárias — este método
   *  não reimplementa transição nenhuma, só as aplica em bloco. */
  const applyReview = Effect.fn('RequestsRepo.applyReview')(function* (
    scope: FirmScope,
    requestId: string,
    input: {
      acceptItemIds: string[];
      rejectDocuments: { documentId: string; rejectionReason: string }[];
      reviewExtras: { documentId: string; decision: ReviewStatus; rejectionReason?: string }[];
    },
    reviewedBy: string,
  ) {
    const [head] = yield* db.use((d) =>
      d
        .select({
          requestId: request.id,
          requestStatus: request.status,
          companyName: company.name,
          uploadLinkId: uploadLink.id,
          contactName: contact.name,
          contactEmail: contact.email,
        })
        .from(request)
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .leftJoin(uploadLink, eq(uploadLink.requestId, request.id))
        .leftJoin(contact, eq(contact.id, uploadLink.contactId))
        .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
        .limit(1),
    );

    if (!head) return undefined;

    const requestStatus = head.requestStatus as RequestStatus;
    const documentIds = [
      ...input.rejectDocuments.map((row) => row.documentId),
      ...input.reviewExtras.map((row) => row.documentId),
    ];

    const items = input.acceptItemIds.length
      ? yield* db.use((d) =>
          d
            .select({ id: requestItem.id, name: requestItem.name, status: requestItem.status })
            .from(requestItem)
            .where(
              and(
                eq(requestItem.requestId, requestId),
                inArray(requestItem.id, input.acceptItemIds),
              ),
            ),
        )
      : [];

    const documents = documentIds.length
      ? yield* db.use((d) =>
          d
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
            .where(and(eq(document.requestId, requestId), inArray(document.id, documentIds))),
        )
      : [];

    const itemById = new Map(items.map((row) => [row.id, row]));
    const documentById = new Map(documents.map((row) => [row.id, row]));

    // Id que não pertence a esta Solicitação é 404, não conflito: pode ser documento de
    // outra empresa, e o painel não deveria ter oferecido a decisão.
    for (const itemId of input.acceptItemIds) {
      if (!itemById.has(itemId)) {
        return yield* Effect.fail(new NotFound('Item não encontrado nesta solicitação.'));
      }
    }
    for (const documentId of documentIds) {
      if (!documentById.has(documentId)) {
        return yield* Effect.fail(new NotFound('Documento não encontrado nesta solicitação.'));
      }
    }

    for (const item of items) {
      const reason = acceptItemRefusal({ requestStatus, itemStatus: item.status as ItemStatus });
      if (reason) return yield* Effect.fail(new InvalidTransition(reason));
    }

    for (const row of input.rejectDocuments) {
      const found = documentById.get(row.documentId)!;

      const reason = rejectDocumentRefusal({
        requestStatus,
        reviewStatus: found.reviewStatus as ReviewStatus,
        requestItemId: found.requestItemId,
      });
      if (reason) return yield* Effect.fail(new InvalidTransition(reason));

      // mesma guarda das rotas unitárias: linha de presign sem arquivo no storage não é
      // documento para revisar — rejeitá-la mandaria recusa de um envio que nunca chegou.
      if (found.uploadStatus !== 'uploaded') {
        return yield* Effect.fail(
          new InvalidTransition('Este documento ainda não foi enviado ao storage.'),
        );
      }
    }

    for (const row of input.reviewExtras) {
      const found = documentById.get(row.documentId)!;

      if (found.requestItemId) {
        return yield* Effect.fail(
          new InvalidTransition('Este documento pertence a um Item: revise-o pelo Item.'),
        );
      }

      const reason = reviewExtraRefusal({
        requestStatus,
        reviewStatus: found.reviewStatus as ReviewStatus,
      });
      if (reason) return yield* Effect.fail(new InvalidTransition(reason));

      if (found.uploadStatus !== 'uploaded') {
        return yield* Effect.fail(
          new InvalidTransition('Este documento ainda não foi enviado ao storage.'),
        );
      }
    }

    // Só rejeição de Item reabre e invalida o Link. Rejeitar Extra não reabre nada, e o
    // link que o Responsável tem continua servindo — rotacionar ali seria puni-lo.
    const reopens = input.rejectDocuments.length > 0;

    if (reopens && !head.uploadLinkId) {
      return yield* Effect.fail(
        new InvalidTransition(
          'Esta solicitação não tem Link de Upload: não é possível reabrir o item.',
        ),
      );
    }

    const rotated = reopens ? createToken() : undefined;

    const applied = yield* db.withTransaction(
      Effect.gen(function* () {
        for (const itemId of input.acceptItemIds) {
          const [updated] = yield* db.use(async (tx) => {
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

            return tx
              .update(requestItem)
              .set({ status: 'accepted' })
              .where(and(eq(requestItem.id, itemId), eq(requestItem.status, 'submitted')))
              .returning({ id: requestItem.id });
          });

          if (!updated) return yield* new InvalidTransition('Este item já foi aceito.');
        }

        for (const row of input.rejectDocuments) {
          const found = documentById.get(row.documentId)!;

          const rejected = yield* db.use((tx) =>
            tx
              .update(document)
              .set({
                reviewStatus: 'rejected',
                rejectionReason: row.rejectionReason,
                reviewedBy,
                reviewedAt: new Date(),
              })
              .where(and(eq(document.id, row.documentId), eq(document.reviewStatus, 'pending')))
              .returning({ id: document.id }),
          );

          if (!rejected.length) {
            return yield* new InvalidTransition(
              'Este documento já foi revisado ou não está pendente.',
            );
          }

          // limpa a marca do cron: prazo que estourar de novo neste Item volta a avisar
          yield* db.use((tx) =>
            tx
              .update(requestItem)
              .set({ status: 'pending', deadlineNotifiedAt: null })
              .where(eq(requestItem.id, found.requestItemId!)),
          );
        }

        for (const row of input.reviewExtras) {
          const updated = yield* db.use((tx) =>
            tx
              .update(document)
              .set({
                reviewStatus: row.decision,
                rejectionReason: row.decision === 'rejected' ? (row.rejectionReason ?? null) : null,
                reviewedBy,
                reviewedAt: new Date(),
              })
              .where(and(eq(document.id, row.documentId), eq(document.reviewStatus, 'pending')))
              .returning({ id: document.id }),
          );

          if (!updated.length) {
            return yield* new InvalidTransition(
              'Este documento já foi revisado ou não está pendente.',
            );
          }
        }

        return yield* db.use(async (tx) => {
          if (rotated) await rotateLinkOnReopenOn(tx, head.uploadLinkId!, rotated.tokenHash);

          return syncRequestStatusOn(tx, requestId);
        });
      }),
    );

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
          rejectionReason: row.rejectionReason,
        })),
        ...input.reviewExtras
          .filter((row) => row.decision === 'rejected')
          .map((row) => ({
            itemName: null,
            rejectionReason: row.rejectionReason!,
          })),
      ],
      token: rotated?.token,
    };
  });

  const closeRequest = Effect.fn('RequestsRepo.closeRequest')(function* (
    scope: FirmScope,
    requestId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({ id: request.id, status: request.status })
        .from(request)
        .innerJoin(period, eq(period.id, request.periodId))
        .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
        .limit(1),
    );

    if (!row) return undefined;
    if (row.status === 'closed') {
      return yield* Effect.fail(new InvalidTransition('Esta solicitação já foi encerrada.'));
    }

    return yield* db.use(async (d) => {
      const [pending] = await d
        .select({ value: count() })
        .from(requestItem)
        .where(and(eq(requestItem.requestId, requestId), ne(requestItem.status, 'accepted')));

      const [closed] = await d
        .update(request)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(request.id, requestId))
        .returning({ id: request.id, status: request.status, closedAt: request.closedAt });

      return { ...closed, pendingItemCount: pending.value };
    });
  });

  /** Itens vencidos de Competência/Solicitação abertas. `scope` nulo = varredura do cron,
   *  que é multi-tenant por natureza (cada evento carrega só os dados da sua
   *  Contabilidade); a rota HTTP passa o escopo da sessão. */
  const overdueItems = Effect.fn('RequestsRepo.overdueItems')(function* (
    scope: FirmScope | null,
    today: string,
  ) {
    const rows = yield* db.use((d) =>
      d
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
        .orderBy(asc(company.name), asc(requestItem.name)),
    );

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
  });

  const accountantEmails = Effect.fn('RequestsRepo.accountantEmails')(function* (
    accountingFirmIds: string[],
  ) {
    if (!accountingFirmIds.length) return new Map<string, string[]>();

    const rows = yield* db.use((d) =>
      d
        .select({ accountingFirmId: accountant.accountingFirmId, email: user.email })
        .from(accountant)
        .innerJoin(user, eq(user.id, accountant.authUserId))
        .where(inArray(accountant.accountingFirmId, accountingFirmIds)),
    );

    return rows.reduce((byFirm, row) => {
      byFirm.set(row.accountingFirmId, [...(byFirm.get(row.accountingFirmId) ?? []), row.email]);
      return byFirm;
    }, new Map<string, string[]>());
  });

  /** Persiste um token já gerado. Existe separado do `rotateUploadToken` para quem precisa
   *  MONTAR a mensagem com o link novo e só oficializar a troca depois de o envio dar
   *  certo — rotacionar antes deixaria o Responsável sem link nenhum se o email falhasse. */
  const applyUploadToken = Effect.fn('RequestsRepo.applyUploadToken')(function* (
    requestId: string,
    tokenHash: string,
    contactId?: string,
    options?: { revokePrevious?: boolean },
  ) {
    return yield* db.withTransaction(
      db.use(async (tx) => {
        const [current] = await tx
          .select({
            id: uploadLink.id,
            tokenHash: uploadLink.tokenHash,
            expiresAt: uploadLink.expiresAt,
          })
          .from(uploadLink)
          .where(eq(uploadLink.requestId, requestId))
          .for('update')
          .limit(1);

        if (!current) return false;

        const now = new Date();
        const graceExpiresAt =
          !options?.revokePrevious && current
            ? new Date(Math.min(current.expiresAt.getTime(), addHours(now, 48).getTime()))
            : null;

        const [row] = await tx
          .update(uploadLink)
          .set({
            tokenHash,
            expiresAt: addDays(now, env.UPLOAD_LINK_TTL_DAYS),
            previousTokenHash: options?.revokePrevious ? null : (current.tokenHash ?? null),
            previousExpiresAt: graceExpiresAt,
            ...(contactId ? { contactId } : {}),
          })
          .where(eq(uploadLink.id, current.id))
          .returning({ id: uploadLink.id });

        return Boolean(row);
      }),
    );
  });

  const rotateUploadToken = Effect.fn('RequestsRepo.rotateUploadToken')(function* (
    requestId: string,
    contactId?: string,
  ) {
    const { token, tokenHash } = createToken();

    return yield* db.withTransaction(
      db.use(async (tx) => {
        const [current] = await tx
          .select({
            id: uploadLink.id,
            tokenHash: uploadLink.tokenHash,
            expiresAt: uploadLink.expiresAt,
          })
          .from(uploadLink)
          .where(eq(uploadLink.requestId, requestId))
          .for('update')
          .limit(1);

        if (!current) return undefined;

        const now = new Date();
        const graceExpiresAt = new Date(
          Math.min(current.expiresAt.getTime(), addHours(now, 48).getTime()),
        );

        const [row] = await tx
          .update(uploadLink)
          .set({
            tokenHash,
            expiresAt: addDays(now, env.UPLOAD_LINK_TTL_DAYS),
            previousTokenHash: current.tokenHash,
            previousExpiresAt: graceExpiresAt,
            ...(contactId ? { contactId } : {}),
          })
          .where(eq(uploadLink.id, current.id))
          .returning({ id: uploadLink.id });

        return row ? token : undefined;
      }),
    );
  });

  const uploadLinkContext = Effect.fn('RequestsRepo.uploadLinkContext')(function* (
    scope: FirmScope,
    requestId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
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
        .limit(1),
    );

    return row;
  });

  const rotateUploadLink = Effect.fn('RequestsRepo.rotateUploadLink')(function* (
    scope: FirmScope,
    requestId: string,
  ) {
    const row = yield* uploadLinkContext(scope, requestId);
    if (!row) return undefined;
    if (row.requestStatus === 'closed') {
      return yield* Effect.fail(
        new InvalidTransition('Solicitação encerrada — não há mais link de envio.'),
      );
    }

    const token = yield* rotateUploadToken(requestId);
    if (!token) return undefined;

    return { ...row, token };
  });

  const markDeadlineNotified = Effect.fn('RequestsRepo.markDeadlineNotified')(function* (
    requestItemIds: string[],
  ) {
    if (requestItemIds.length === 0) return;

    yield* db.use((d) =>
      d
        .update(requestItem)
        .set({ deadlineNotifiedAt: new Date() })
        .where(inArray(requestItem.id, requestItemIds)),
    );
  });

  const documentsForRequestZip = Effect.fn('RequestsRepo.documentsForRequestZip')(function* (
    scope: FirmScope,
    requestId: string,
  ) {
    return yield* db.use(async (d) => {
      const [head] = await d
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

      const documents = await d
        .select({
          storageKey: document.storageKey,
          fileName: document.fileName,
          itemName: requestItem.name,
          companyName: company.name,
          reviewStatus: document.reviewStatus,
          requestStatus: request.status,
        })
        .from(document)
        .innerJoin(request, eq(request.id, document.requestId))
        .innerJoin(company, eq(company.id, request.companyId))
        .leftJoin(requestItem, eq(requestItem.id, document.requestItemId))
        .where(and(eq(document.requestId, requestId), eq(document.uploadStatus, 'uploaded')))
        .orderBy(asc(requestItem.name), asc(document.uploadedAt));

      return { ...head, documents };
    });
  });

  /** Um documento para leitura no painel (preview/baixar avulso). Mesmo join de escopo do
   *  zip: documento de outra Contabilidade não é alcançado e a rota responde 404.
   *  `awaiting_upload` fica de fora — a linha existe, o objeto no storage não. */
  const documentForRead = Effect.fn('RequestsRepo.documentForRead')(function* (
    scope: FirmScope | ContactScope,
    documentId: string,
  ) {
    const isFirm = typeof scope === 'string';
    const [row] = yield* db.use((d) =>
      d
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
            isFirm
              ? eq(period.accountingFirmId, scope)
              : inArray(request.companyId, companyIdsOf(scope)),
            eq(document.uploadStatus, 'uploaded'),
          ),
        )
        .limit(1),
    );

    return row;
  });

  const pending = Effect.fn('RequestsRepo.pending')(function* (scope: ContactScope) {
    return yield* db.use(async (d) => {
      const items = await d
        .select({
          requestId: request.id,
          requestStatus: request.status,
          periodId: period.id,
          referenceMonth: period.referenceMonth,
          periodDueDate: period.dueDate,
          companyId: company.id,
          companyName: company.name,
          itemId: requestItem.id,
          itemName: requestItem.name,
          description: requestItem.description,
          acceptedFormats: requestItem.acceptedFormats,
          itemStatus: requestItem.status,
          itemDueDate: requestItem.dueDate,
        })
        .from(requestItem)
        .innerJoin(request, eq(request.id, requestItem.requestId))
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(
          and(
            inArray(request.companyId, companyIdsOf(scope)),
            eq(period.status, 'open'),
            ne(request.status, 'closed'),
          ),
        )
        .orderBy(asc(requestItem.dueDate), asc(requestItem.name));

      const itemIds = items.map((row) => row.itemId);

      const rejections = itemIds.length
        ? await d
            .select({
              requestItemId: document.requestItemId,
              fileName: document.fileName,
              rejectionReason: document.rejectionReason,
            })
            .from(document)
            .where(
              and(
                inArray(document.requestItemId, itemIds),
                eq(document.reviewStatus, 'rejected'),
                eq(document.uploadStatus, 'uploaded'),
              ),
            )
            .orderBy(asc(document.uploadedAt))
        : [];

      return items.map((item) => ({
        ...item,
        rejections: rejections
          .filter((row) => row.requestItemId === item.itemId)
          .map((row) => ({ fileName: row.fileName, rejectionReason: row.rejectionReason })),
      }));
    });
  });

  const documentsForPeriodZip = Effect.fn('RequestsRepo.documentsForPeriodZip')(function* (
    scope: FirmScope,
    periodId: string,
  ) {
    return yield* db.use(async (d) => {
      const [head] = await d
        .select({ referenceMonth: period.referenceMonth })
        .from(period)
        .where(and(eq(period.id, periodId), eq(period.accountingFirmId, scope)))
        .limit(1);

      if (!head) return undefined;

      const documents = await d
        .select({
          storageKey: document.storageKey,
          fileName: document.fileName,
          itemName: requestItem.name,
          companyName: company.name,
          reviewStatus: document.reviewStatus,
          requestStatus: request.status,
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
    });
  });

  /** #8 — Documento Extra é revisável individualmente (não há Item para revisar em lote).
   *  Aceitar/rejeitar Extra não mexe em `request_item` nem no `complete`: Extra não é
   *  exigência do checklist. Rejeitar Extra também não reenvia link — não há item reaberto. */
  const reviewExtraDocument = Effect.fn('RequestsRepo.reviewExtraDocument')(function* (
    scope: FirmScope,
    documentId: string,
    decision: { reviewStatus: 'accepted' | 'rejected'; rejectionReason?: string },
    reviewedBy: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
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
        .limit(1),
    );

    if (!row) return undefined;
    if (row.requestItemId) {
      return yield* Effect.fail(
        new InvalidTransition(
          'Este documento pertence a um item: aceite pelo item (em lote) ou rejeite pelo documento.',
        ),
      );
    }
    if (row.uploadStatus !== 'uploaded') {
      return yield* Effect.fail(
        new InvalidTransition('Este documento ainda não foi enviado ao storage.'),
      );
    }

    const refusal = reviewExtraRefusal({
      requestStatus: row.requestStatus as RequestStatus,
      reviewStatus: row.reviewStatus as ReviewStatus,
    });
    if (refusal) return yield* Effect.fail(new InvalidTransition(refusal));

    const [updated] = yield* db.use((d) =>
      d
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
        }),
    );

    if (!updated) {
      return yield* Effect.fail(new InvalidTransition('Este documento já foi revisado.'));
    }

    return updated;
  });

  const undoAcceptItem = Effect.fn('RequestsRepo.undoAcceptItem')(function* (
    scope: FirmScope,
    requestItemId: string,
  ) {
    const context = yield* db.use((d) => itemContextOn(d, scope, requestItemId));
    if (!context) return undefined;

    const refusal = undoAcceptRefusal(context);
    if (refusal) return yield* Effect.fail(new InvalidTransition(refusal));

    return yield* db.withTransaction(
      db.use(async (tx) => {
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

        const requestStatus = await syncRequestStatusOn(tx, context.requestId);

        return {
          requestId: context.requestId,
          requestItemId,
          itemName: context.itemName,
          itemStatus,
          revertedDocuments: reverted.length,
          requestStatus,
        };
      }),
    );
  });

  const reminderCandidates = Effect.fn('RequestsRepo.reminderCandidates')(function* (
    scope?: FirmScope,
  ) {
    return yield* db.use(async (d) => {
      const items = await d
        .select({
          requestId: request.id,
          accountingFirmId: period.accountingFirmId,
          companyName: company.name,
          referenceMonth: period.referenceMonth,
          periodDueDate: period.dueDate,
          itemName: requestItem.name,
          itemDueDate: requestItem.dueDate,
        })
        .from(requestItem)
        .innerJoin(request, eq(request.id, requestItem.requestId))
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(
          and(
            inArray(requestItem.status, ['pending', 'rejected']),
            eq(request.status, 'open'),
            eq(period.status, 'open'),
            scope ? eq(period.accountingFirmId, scope) : undefined,
          ),
        );

      const requestIds = [...new Set(items.map((row) => row.requestId))];
      if (!requestIds.length) return [];

      const recipients = await d
        .selectDistinct({
          requestId: uploadLink.requestId,
          contactName: contact.name,
          contactEmail: contact.email,
        })
        .from(uploadLink)
        .innerJoin(contact, eq(contact.id, uploadLink.contactId))
        .where(inArray(uploadLink.requestId, requestIds));

      const stats = await d
        .select({
          requestId: message.requestId,
          /* `channel <> 'push'` porque um lembrete grava DUAS linhas quando o Responsável
           * tem o app: a entrega (`deliver`) e o empurrão (`notify`). Contando as duas, quem
           * instalou o app recebia metade dos lembretes — o teto de 2 enchia na primeira
           * rodada. O que conta é o despacho, não os canais em que ele saiu. */
          reminderCount: sql<number>`count(*) filter (
            where ${message.purpose} = 'reminder'
              and ${message.status} <> 'failed'
              and ${message.channel} <> 'push'
          )::int`,
          lastMessageAt: sql<Date | null>`max(${message.createdAt})`,
        })
        .from(message)
        .where(inArray(message.requestId, requestIds))
        .groupBy(message.requestId);

      const recipientOf = new Map(recipients.map((row) => [row.requestId, row]));
      const statsOf = new Map(stats.map((row) => [row.requestId, row]));
      const candidates = new Map<
        string,
        ReminderCandidate & {
          companyName: string;
          contactName: string;
          contactEmail: string;
          referenceMonth: string;
        }
      >();

      for (const row of items) {
        const recipient = recipientOf.get(row.requestId);
        if (!recipient) continue;

        const candidate = candidates.get(row.requestId) ?? {
          requestId: row.requestId,
          accountingFirmId: row.accountingFirmId,
          companyName: row.companyName,
          referenceMonth: row.referenceMonth,
          periodDueDate: row.periodDueDate,
          contactName: recipient.contactName,
          contactEmail: recipient.contactEmail,
          reminderCount: statsOf.get(row.requestId)?.reminderCount ?? 0,
          lastMessageAt: statsOf.get(row.requestId)?.lastMessageAt ?? null,
          pendingItems: [],
        };

        candidate.pendingItems.push({ name: row.itemName, dueDate: row.itemDueDate });
        candidates.set(row.requestId, candidate);
      }

      return [...candidates.values()];
    });
  });

  /** Resolução única da cadência, e por isso o lugar do gate: o cron não passa por guard
   *  HTTP. Firm sem a capability `reminderTuning` roda no padrão **ignorando** o que estiver
   *  gravado nas colunas — downgrade não zera os valores, só para de aplicá-los, e voltar a
   *  subir de plano restaura o que estava lá. O lembrete em si continua rodando em todo
   *  plano: o gate é sobre os knobs, não sobre a cobrança automática (D18 §4). */
  const reminderSettingsByFirm = Effect.fn('RequestsRepo.reminderSettingsByFirm')(function* (
    firmIds: string[],
  ) {
    if (!firmIds.length) return new Map<string, ReminderSettings>();

    const rows = yield* db.use((d) =>
      d
        .select({
          id: accountingFirm.id,
          planName: subscription.planName,
          reminderMax: accountingFirm.reminderMax,
          reminderDueSoonDays: accountingFirm.reminderDueSoonDays,
          reminderGapDays: accountingFirm.reminderGapDays,
        })
        .from(accountingFirm)
        .leftJoin(subscription, eq(subscription.accountingFirmId, accountingFirm.id))
        .where(inArray(accountingFirm.id, firmIds)),
    );

    return new Map<string, ReminderSettings>(
      rows.map(({ id, planName, ...settings }) => [
        id,
        planAllows(planName ?? 'trial', 'reminderTuning') ? settings : DEFAULT_REMINDER_SETTINGS,
      ]),
    );
  });

  /** Voo único das varreduras. Devolve `null` quando outra instância segura a lease.
   *
   *  Lease em linha, e não `pg_advisory_lock`: o advisory é de SESSÃO, e `db.use` tira um
   *  checkout novo do pool a cada `execute` — o unlock caía numa conexão diferente da do lock
   *  e vazava. Com `min: 5` no pool, a conexão nunca era reciclada, então a lease ficava presa
   *  e toda varredura seguinte era pulada em silêncio. Aqui tomar é um `INSERT … ON CONFLICT
   *  … WHERE expires_at < now()`, atômico num statement só e sem depender de sessão. */
  const withLease = <T>(name: string, task: () => Promise<T>) =>
    db.use(async (d): Promise<T | null> => {
      const holder = randomUUID();
      /* Todo o tempo vem do BANCO (`now()`), nunca do relógio do Node: gravar `expires_at`
       * com um relógio e compará-lo com o outro deixa a lease presa sempre que as máquinas
       * divergem alguns milissegundos. */
      const expiry = sql`now() + make_interval(secs => ${LEASE_TTL_SECONDS})`;
      const taken = await d
        .insert(cronLease)
        .values({ name, holder, expiresAt: expiry })
        .onConflictDoUpdate({
          target: cronLease.name,
          set: { holder, expiresAt: expiry },
          setWhere: sql`${cronLease.expiresAt} < now()`,
        })
        .returning({ name: cronLease.name });

      if (taken.length === 0) return null;

      try {
        return await task();
      } finally {
        /* `holder` no WHERE: se a varredura estourar o TTL e outra instância tomar a lease, a
         * nossa liberação não pode derrubar a dela. */
        await d
          .update(cronLease)
          .set({ expiresAt: sql`now() - interval '1 second'` })
          .where(and(eq(cronLease.name, name), eq(cronLease.holder, holder)));
      }
    });

  return {
    findById,
    acceptItem,
    rejectDocument,
    applyReview,
    closeRequest,
    overdueItems,
    accountantEmails,
    applyUploadToken,
    rotateUploadToken,
    uploadLinkContext,
    rotateUploadLink,
    markDeadlineNotified,
    documentsForRequestZip,
    documentForRead,
    pending,
    documentsForPeriodZip,
    reviewExtraDocument,
    undoAcceptItem,
    reminderCandidates,
    reminderSettingsByFirm,
    withLease,
  };
});

export class RequestsRepo extends Context.Service<RequestsRepo, Effect.Success<typeof make>>()(
  'competa/api/requests/RequestsRepo',
) {
  static readonly layerNoDeps = Layer.effect(RequestsRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}

import { Context, Effect, Layer } from 'effect';
import { and, asc, eq, gt, or } from 'drizzle-orm';
import { planAllows } from '@competa/contracts';
import { Db } from '../../infra/database/effect.js';
import {
  accountingFirm,
  company,
  contact,
  document,
  period,
  request,
  requestItem,
  subscription,
  uploadLink,
} from '../../infra/database/schema/index.js';
import type { UploadScope } from '../auth/scope.js';

const make = Effect.gen(function* () {
  const db = yield* Db;

  const findByTokenHash = Effect.fn('UploadLinksRepo.findByTokenHash')(function* (
    tokenHash: string,
  ) {
    const now = new Date();
    const [row] = yield* db.use((d) =>
      d
        .select({
          requestId: uploadLink.requestId,
          contactId: uploadLink.contactId,
          expiresAt: uploadLink.expiresAt,
          previousExpiresAt: uploadLink.previousExpiresAt,
          tokenHash: uploadLink.tokenHash,
          previousTokenHash: uploadLink.previousTokenHash,
          revoked: uploadLink.revoked,
        })
        .from(uploadLink)
        .innerJoin(request, eq(request.id, uploadLink.requestId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(
          and(
            eq(company.active, true),
            or(
              eq(uploadLink.tokenHash, tokenHash),
              and(
                eq(uploadLink.previousTokenHash, tokenHash),
                gt(uploadLink.previousExpiresAt, now),
              ),
            ),
          ),
        )
        .limit(1),
    );

    if (!row) return undefined;

    const isCurrent = row.tokenHash === tokenHash;
    const effectiveExpiresAt = isCurrent ? row.expiresAt : row.previousExpiresAt!;

    return {
      requestId: row.requestId,
      contactId: row.contactId,
      expiresAt: effectiveExpiresAt,
      revoked: row.revoked,
    };
  });

  /** O que a página pública mostra. O Link é só-escrita: nem conteúdo, nem `storage_key`,
   *  nem NOME de arquivo — nome de arquivo contábil costuma carregar CNPJ, razão social de
   *  terceiros e valores, e quem tem o link não é necessariamente quem enviou. Sobra o que
   *  o Responsável precisa para saber o que falta: ordem do envio, status e motivo da
   *  recusa. */
  const findChecklist = Effect.fn('UploadLinksRepo.findChecklist')(function* (scope: UploadScope) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({
          companyName: company.name,
          accountingFirmName: accountingFirm.name,
          accountingFirmLogoUrl: accountingFirm.logoUrl,
          planName: subscription.planName,
          referenceMonth: period.referenceMonth,
          periodDueDate: period.dueDate,
          status: request.status,
        })
        .from(request)
        .innerJoin(company, eq(company.id, request.companyId))
        .innerJoin(accountingFirm, eq(accountingFirm.id, company.accountingFirmId))
        .leftJoin(subscription, eq(subscription.accountingFirmId, accountingFirm.id))
        .innerJoin(period, eq(period.id, request.periodId))
        .where(eq(request.id, scope.requestId))
        .limit(1);

      if (!row) return undefined;

      const [items, documents] = await Promise.all([
        d
          .select({
            id: requestItem.id,
            name: requestItem.name,
            description: requestItem.description,
            acceptedFormats: requestItem.acceptedFormats,
            dueDate: requestItem.dueDate,
            status: requestItem.status,
          })
          .from(requestItem)
          .where(eq(requestItem.requestId, scope.requestId))
          .orderBy(asc(requestItem.name)),
        d
          .select({
            requestItemId: document.requestItemId,
            reviewStatus: document.reviewStatus,
            rejectionReason: document.rejectionReason,
          })
          .from(document)
          .where(
            and(eq(document.requestId, scope.requestId), eq(document.uploadStatus, 'uploaded')),
          )
          .orderBy(asc(document.uploadedAt)),
      ]);

      return {
        ...row,
        /** Marca do escritório na página pública: só no plano com a capability `branding`. */
        accountingFirmLogoUrl: planAllows(row.planName ?? 'trial', 'branding')
          ? row.accountingFirmLogoUrl
          : null,
        items: items.map((item) => ({
          ...item,
          documents: documents.filter((file) => file.requestItemId === item.id),
        })),
        extraDocuments: documents.filter((file) => !file.requestItemId),
      };
    });
  });

  const findContact = Effect.fn('UploadLinksRepo.findContact')(function* (scope: UploadScope) {
    const [row] = yield* db.use((d) =>
      d
        .select({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          authUserId: contact.authUserId,
        })
        .from(contact)
        .where(eq(contact.id, scope.contactId))
        .limit(1),
    );

    return row;
  });

  return { findByTokenHash, findChecklist, findContact };
});

export class UploadLinksRepo extends Context.Service<
  UploadLinksRepo,
  Effect.Success<typeof make>
>()('competa/api/requests/UploadLinksRepo') {
  static readonly layerNoDeps = Layer.effect(UploadLinksRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}

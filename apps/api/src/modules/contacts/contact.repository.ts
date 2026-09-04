import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  accountingFirm,
  company,
  contact,
  document,
  period,
  pushSubscription,
  request,
  requestItem,
  user,
} from '../../infra/database/schema/index.js';
import type { ContactScope, FirmScope } from '../auth/scope.js';

/** Tudo aqui é escopado por `ContactScope`: o Responsável alcança a Empresa dele e mais
 *  nada. Nenhum método devolve `storage_key` nem conteúdo — ele vê nome, status, prazo e
 *  autoria (decisão de visibilidade da Fase 10). */
@Injectable()
export class ContactRepository {
  constructor(private readonly db: Database) {}

  /** Vínculo do Responsável com a Empresa e a Contabilidade que o cobra. */
  async profile(scope: ContactScope) {
    const [row] = await this.db
      .select({
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        companyId: company.id,
        companyName: company.name,
        accountingFirmName: accountingFirm.name,
      })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .innerJoin(accountingFirm, eq(accountingFirm.id, company.accountingFirmId))
      .where(eq(contact.id, scope.contactId))
      .limit(1);

    return row;
  }

  /** Contato pelo `auth_user_id` da sessão — usado logo depois de criar o acesso. */
  async findByAuthUser(authUserId: string) {
    const [row] = await this.db
      .select({ id: contact.id, companyId: contact.companyId })
      .from(contact)
      .where(eq(contact.authUserId, authUserId))
      .limit(1);

    return row;
  }

  /** Cria a conta do Responsável a partir do Link: vincula o `user` ao `contact`. Só o
   *  contato do Link é aceito, e só se ainda não tiver acesso. */
  async linkAuthUser(contactId: string, authUserId: string) {
    const [row] = await this.db
      .update(contact)
      .set({ authUserId })
      .where(eq(contact.id, contactId))
      .returning({ id: contact.id, companyId: contact.companyId });

    return row;
  }

  /** O que falta agora: itens não aceitos da Competência aberta, com prazo efetivo. */
  async pending(scope: ContactScope) {
    return this.db
      .select({
        requestId: request.id,
        requestStatus: request.status,
        periodId: period.id,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
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
      .where(
        and(
          eq(request.companyId, scope.companyId),
          eq(period.status, 'open'),
          ne(request.status, 'closed'),
          ne(requestItem.status, 'accepted'),
        ),
      )
      .orderBy(asc(requestItem.dueDate), asc(requestItem.name));
  }

  /** Competências da Empresa, mais recente primeiro. */
  async periods(scope: ContactScope, query: { page: number; perPage: number }) {
    const where = eq(request.companyId, scope.companyId);

    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          requestId: request.id,
          requestStatus: request.status,
          periodId: period.id,
          referenceMonth: period.referenceMonth,
          periodStatus: period.status,
          dueDate: period.dueDate,
          itemCount: this.db.$count(requestItem, eq(requestItem.requestId, request.id)),
          pendingCount: this.db.$count(
            requestItem,
            and(eq(requestItem.requestId, request.id), ne(requestItem.status, 'accepted')),
          ),
        })
        .from(request)
        .innerJoin(period, eq(period.id, request.periodId))
        .where(where)
        .orderBy(desc(period.referenceMonth))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      this.db.select({ value: count() }).from(request).where(where),
    ]);

    return { rows, total: total.value };
  }

  /** Detalhe de uma Competência: itens com status e os arquivos enviados, com QUEM enviou.
   *  `storage_key` fica fora de propósito — nome, tamanho e autoria bastam. */
  async periodDetail(scope: ContactScope, periodId: string) {
    const [head] = await this.db
      .select({
        requestId: request.id,
        requestStatus: request.status,
        periodId: period.id,
        referenceMonth: period.referenceMonth,
        periodStatus: period.status,
        dueDate: period.dueDate,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .where(and(eq(request.companyId, scope.companyId), eq(period.id, periodId)))
      .limit(1);

    if (!head) return undefined;

    const [items, documents] = await Promise.all([
      this.db
        .select({
          id: requestItem.id,
          name: requestItem.name,
          description: requestItem.description,
          acceptedFormats: requestItem.acceptedFormats,
          status: requestItem.status,
          dueDate: requestItem.dueDate,
        })
        .from(requestItem)
        .where(eq(requestItem.requestId, head.requestId))
        .orderBy(asc(requestItem.name)),
      this.db
        .select({
          id: document.id,
          requestItemId: document.requestItemId,
          fileName: document.fileName,
          sizeBytes: document.sizeBytes,
          uploadedAt: document.uploadedAt,
          reviewStatus: document.reviewStatus,
          rejectionReason: document.rejectionReason,
          uploadedByName: contact.name,
        })
        .from(document)
        .leftJoin(contact, eq(contact.id, document.uploadedByContactId))
        .where(and(eq(document.requestId, head.requestId), eq(document.uploadStatus, 'uploaded')))
        .orderBy(asc(document.uploadedAt)),
    ]);

    return {
      ...head,
      items: items.map((item) => ({
        ...item,
        dueDate: item.dueDate ?? head.dueDate,
        documents: documents.filter((row) => row.requestItemId === item.id),
      })),
      extraDocuments: documents.filter((row) => !row.requestItemId),
    };
  }

  /** A Solicitação tem que ser da Empresa do Responsável — é o que autoriza o upload
   *  logado a reaproveitar o pipeline do fluxo por link. */
  async ownsRequest(scope: ContactScope, requestId: string) {
    const [row] = await this.db
      .select({ id: request.id })
      .from(request)
      .where(and(eq(request.id, requestId), eq(request.companyId, scope.companyId)))
      .limit(1);

    return Boolean(row);
  }

  /** Inscrição de push: `endpoint` é chave natural, então reinscrever é upsert. */
  async savePushSubscription(
    scope: ContactScope,
    input: { endpoint: string; keys: Record<string, string> },
  ) {
    const [row] = await this.db
      .insert(pushSubscription)
      .values({ contactId: scope.contactId, provider: 'web', ...input })
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: { contactId: scope.contactId, keys: input.keys },
      })
      .returning({ id: pushSubscription.id, endpoint: pushSubscription.endpoint });

    return row;
  }

  async deletePushSubscription(scope: ContactScope, endpoint: string) {
    const [row] = await this.db
      .delete(pushSubscription)
      .where(
        and(
          eq(pushSubscription.contactId, scope.contactId),
          eq(pushSubscription.endpoint, endpoint),
        ),
      )
      .returning({ id: pushSubscription.id });

    return row;
  }

  /** Inscrição que o navegador descartou (404/410 no envio). */
  async deletePushSubscriptionByEndpoint(endpoint: string) {
    await this.db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
  }

  /** Inscrições dos Responsáveis de uma Solicitação — usado pelo envio de push. */
  async subscriptionsForRequest(requestId: string) {
    return this.db
      .select({
        endpoint: pushSubscription.endpoint,
        keys: pushSubscription.keys,
        contactName: contact.name,
      })
      .from(pushSubscription)
      .innerJoin(contact, eq(contact.id, pushSubscription.contactId))
      .innerJoin(company, eq(company.id, contact.companyId))
      .innerJoin(request, eq(request.companyId, company.id))
      .where(eq(request.id, requestId));
  }

  /** Revogação pelo Contador (F10-7): tira o vínculo, as sessões e as passkeys. Conceder
   *  acesso sem poder revogar é defeito de segurança, não falta de feature. */
  async revokeAccess(scope: FirmScope, companyId: string, contactId: string) {
    const [row] = await this.db
      .select({ id: contact.id, authUserId: contact.authUserId })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(
        and(
          eq(contact.id, contactId),
          eq(contact.companyId, companyId),
          eq(company.accountingFirmId, scope),
        ),
      )
      .limit(1);

    if (!row) return undefined;
    if (!row.authUserId) return { revoked: false as const };

    await this.db.transaction(async (tx) => {
      await tx.update(contact).set({ authUserId: null }).where(eq(contact.id, contactId));
      // as sessões e as passkeys vivem penduradas no `user`: apagá-lo derruba os dois por
      // cascade, e o Responsável volta a ser só destinatário de Link
      await tx.delete(user).where(eq(user.id, row.authUserId!));
      await tx.delete(pushSubscription).where(eq(pushSubscription.contactId, contactId));
    });

    return { revoked: true as const };
  }

  /** Responsáveis com acesso — para o painel do Contador saber quem revogar. */
  async withAccess(scope: FirmScope, companyId: string) {
    return this.db
      .select({ id: contact.id, name: contact.name, email: contact.email })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(
        and(
          eq(contact.companyId, companyId),
          eq(company.accountingFirmId, scope),
          isNotNull(contact.authUserId),
        ),
      );
  }

  async contactsOf(companyIds: string[]) {
    if (!companyIds.length) return [];

    return this.db
      .select({ id: contact.id, companyId: contact.companyId, name: contact.name })
      .from(contact)
      .where(inArray(contact.companyId, companyIds));
  }
}

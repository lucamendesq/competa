import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  accountant,
  accountingFirm,
  company,
  contact,
  document,
  message,
  period,
  pushSubscription,
  request,
  requestItem,
  user,
} from '../../infra/database/schema/index.js';
import {
  companyIdsOf,
  contactIdsOf,
  type ContactScope,
  type FirmScope,
  type UploadScope,
} from '../auth/scope.js';

/** Tudo aqui é escopado por `ContactScope`: o Responsável alcança a Empresa dele e mais
 *  nada. `documentForRead` é o único método que devolve `storage_key` — e só para o
 *  controller streamar o conteúdo; o resto vê nome, status, prazo e autoria. */
@Injectable()
export class ContactRepository {
  constructor(private readonly db: Database) {}

  async profile(scope: ContactScope) {
    const rows = await this.db
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
      .where(inArray(contact.id, contactIdsOf(scope)))
      .orderBy(asc(contact.createdAt), asc(contact.id));

    const [first] = rows;
    if (!first) return undefined;

    /* compat: `companyId`/`companyName`/`accountingFirmName` do primeiro vínculo seguem no
     * topo (é o que o header do web mostra hoje); `companies` traz todos. */
    return {
      contactId: first.contactId,
      name: first.name,
      email: first.email,
      phone: first.phone,
      companyId: first.companyId,
      companyName: first.companyName,
      accountingFirmName: first.accountingFirmName,
      companies: rows.map((row) => ({
        companyId: row.companyId,
        companyName: row.companyName,
        accountingFirmName: row.accountingFirmName,
      })),
    };
  }

  async findByEmailInCompany(companyId: string, email: string) {
    const [row] = await this.db
      .select({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        authUserId: contact.authUserId,
      })
      .from(contact)
      .where(and(eq(contact.companyId, companyId), eq(contact.email, email)))
      .limit(1);

    return row;
  }

  /** Solicitações abertas de um email de Responsável, para o "perdi meu link" reenviar o
   *  Link de Upload. Único método sem escopo branded: a entrada É o email, e quem chama é
   *  a rota pública de recuperação, que responde igual em todos os casos e nunca devolve
   *  nada ao cliente. Não usar em rota que exiba dado. */
  async openRequestsForEmail(email: string) {
    return this.db
      .select({
        requestId: request.id,
        contactId: contact.id,
        contactName: contact.name,
        contactEmail: contact.email,
        companyName: company.name,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
        hasAccess: contact.authUserId,
        /* Última entrega de link para esta Solicitação — é o que segura o cooldown do
         * "perdi meu link". Falhada não conta: se o email não saiu, o Responsável ainda
         * está sem link e precisa poder pedir de novo. */
        lastLinkSentAt: sql<Date | null>`(
          select max(${message.createdAt}) from ${message}
          where ${message.requestId} = ${request.id}
            and ${message.purpose} = 'link_delivery'
            and ${message.status} <> 'failed'
        )`,
      })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .innerJoin(request, eq(request.companyId, company.id))
      .innerJoin(period, eq(period.id, request.periodId))
      .where(
        and(
          eq(contact.email, email),
          eq(company.active, true),
          eq(request.status, 'open'),
          eq(period.status, 'open'),
        ),
      )
      .orderBy(desc(period.referenceMonth));
  }

  /** Existe conta com este email? A ativação passwordless pelo Link de Upload NÃO pode
   *  rodar quando existe: o magic link interno logaria NA conta existente e o vínculo
   *  entregaria a sessão dela a quem controla o Link (AUTHZ-1). */
  async userByEmail(email: string) {
    const [row] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    if (!row) return undefined;

    const [[asAccountant], [asContact]] = await Promise.all([
      this.db
        .select({ id: accountant.id })
        .from(accountant)
        .where(eq(accountant.authUserId, row.id))
        .limit(1),
      this.db
        .select({ id: contact.id })
        .from(contact)
        .where(eq(contact.authUserId, row.id))
        .limit(1),
    ]);

    return { id: row.id, isAccountant: Boolean(asAccountant), isContact: Boolean(asContact) };
  }

  /** O token do convite foi entregue no email do contato: posse provada. Sem isto, o
   *  primeiro magic link nessa conta dispara o revokeUnprovenAccountAccess do better-auth
   *  e apaga a senha recém-criada. O aceite dos Termos é carimbado junto: a tela informa
   *  que criar a conta implica no aceite. */
  async markUserEmailVerified(userId: string) {
    await this.db
      .update(user)
      .set({ emailVerified: true, termsAcceptedAt: new Date() })
      .where(eq(user.id, userId));
  }

  /** Aceite dos Termos no fluxo passwordless (a conta nasce/vincula pelo Link). */
  async markTermsAccepted(userId: string) {
    await this.db
      .update(user)
      .set({ termsAcceptedAt: new Date() })
      .where(and(eq(user.id, userId), isNull(user.termsAcceptedAt)));
  }

  async linkAuthUser(contactId: string, authUserId: string) {
    const [row] = await this.db
      .update(contact)
      .set({ authUserId })
      .where(eq(contact.id, contactId))
      .returning({ id: contact.id, companyId: contact.companyId });

    return row;
  }

  async pending(scope: ContactScope) {
    const items = await this.db
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
          ne(requestItem.status, 'accepted'),
        ),
      )
      .orderBy(asc(requestItem.dueDate), asc(requestItem.name));

    // O Item recusado volta para `pending` (invariante do domínio: `rejected → pending`),
    // então o status sozinho não distingue "nunca enviei" de "enviei e voltou". Sem os
    // motivos aqui, o Painel de Pendências pedia reenvio sem dizer o quê corrigir.
    const itemIds = items.map((row) => row.itemId);

    const rejections = itemIds.length
      ? await this.db
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
  }

  async periods(scope: ContactScope, query: { page: number; perPage: number }) {
    const where = inArray(request.companyId, companyIdsOf(scope));

    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          requestId: request.id,
          requestStatus: request.status,
          periodId: period.id,
          referenceMonth: period.referenceMonth,
          periodStatus: period.status,
          dueDate: period.dueDate,
          companyId: company.id,
          companyName: company.name,
          itemCount: this.db.$count(requestItem, eq(requestItem.requestId, request.id)),
          pendingCount: this.db.$count(
            requestItem,
            and(eq(requestItem.requestId, request.id), ne(requestItem.status, 'accepted')),
          ),
          deliveredCount: this.db.$count(
            document,
            and(eq(document.requestId, request.id), eq(document.uploadStatus, 'uploaded')),
          ),
        })
        .from(request)
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(where)
        .orderBy(desc(period.referenceMonth), asc(company.name))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      this.db.select({ value: count() }).from(request).where(where),
    ]);

    return { rows, total: total.value };
  }

  /** `companyId` desambigua quando o mesmo user tem request em 2+ Empresas na MESMA
   *  competência — o front sempre manda, vindo da linha da lista. Sem ele, vale a
   *  primeira Empresa (ordem estável). */
  async periodDetail(scope: ContactScope, periodId: string, companyId?: string) {
    const companyIds = companyIdsOf(scope);
    if (companyId && !companyIds.includes(companyId)) return undefined;

    const [head] = await this.db
      .select({
        requestId: request.id,
        requestStatus: request.status,
        periodId: period.id,
        referenceMonth: period.referenceMonth,
        periodStatus: period.status,
        dueDate: period.dueDate,
        companyId: company.id,
        companyName: company.name,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .where(
        and(
          companyId ? eq(request.companyId, companyId) : inArray(request.companyId, companyIds),
          eq(period.id, periodId),
        ),
      )
      .orderBy(asc(company.name))
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

  /** Espelho do `RequestRepository.documentForRead`, com o escopo trocado: o join chega na
   *  Empresa do Responsável em vez da Contabilidade. `awaiting_upload` fica de fora — a
   *  linha existe, o objeto no storage não. */
  async documentForRead(scope: ContactScope, documentId: string) {
    const [row] = await this.db
      .select({
        storageKey: document.storageKey,
        fileName: document.fileName,
        contentType: document.contentType,
      })
      .from(document)
      .innerJoin(request, eq(request.id, document.requestId))
      .where(
        and(
          eq(document.id, documentId),
          inArray(request.companyId, companyIdsOf(scope)),
          eq(document.uploadStatus, 'uploaded'),
        ),
      )
      .limit(1);

    return row;
  }

  /** Inscrição de push: o par `(contact, endpoint)` é a chave — o mesmo aparelho serve os
   *  N contatos de um user multi-empresa, e reinscrever é upsert das keys (nunca rouba a
   *  linha de outro contato — AUTHZ-4). Aceita os dois escopos que resolvem contato: a
   *  área logada (inscreve todos os vínculos) e o Link de Upload (só o dele). */
  async savePushSubscription(
    scope: ContactScope | UploadScope,
    input: { endpoint: string; keys: Record<string, string> },
  ) {
    const contactIds = 'memberships' in scope ? contactIdsOf(scope) : [scope.contactId];

    const rows = await this.db
      .insert(pushSubscription)
      .values(contactIds.map((contactId) => ({ contactId, provider: 'web', ...input })))
      .onConflictDoUpdate({
        target: [pushSubscription.contactId, pushSubscription.endpoint],
        set: { keys: input.keys },
      })
      .returning({ id: pushSubscription.id, endpoint: pushSubscription.endpoint });

    return rows[0];
  }

  async deletePushSubscription(scope: ContactScope, endpoint: string) {
    const [row] = await this.db
      .delete(pushSubscription)
      .where(
        and(
          inArray(pushSubscription.contactId, contactIdsOf(scope)),
          eq(pushSubscription.endpoint, endpoint),
        ),
      )
      .returning({ id: pushSubscription.id });

    return row;
  }

  async deletePushSubscriptionByEndpoint(endpoint: string) {
    await this.db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
  }

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
      await tx.delete(pushSubscription).where(eq(pushSubscription.contactId, contactId));

      /* Multi-empresa: o `user` só morre quando este era o ÚLTIMO vínculo — apagá-lo com
       * outro vínculo vivo derrubaria o acesso das outras Empresas. Com vínculo restante,
       * as sessões ficam: os guards re-resolvem o escopo a cada request e a Empresa
       * revogada some na hora. Sem nenhum, apagar o `user` derruba sessões e passkeys por
       * cascade, e o Responsável volta a ser só destinatário de Link. */
      const [still] = await tx
        .select({ id: contact.id })
        .from(contact)
        .where(eq(contact.authUserId, row.authUserId!))
        .limit(1);

      if (!still) await tx.delete(user).where(eq(user.id, row.authUserId!));
    });

    return { revoked: true as const };
  }

  async findOwnedCompany(scope: FirmScope, companyId: string) {
    const [row] = await this.db
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .limit(1);

    return Boolean(row);
  }

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

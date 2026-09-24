import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  account,
  accountant,
  accountingFirm,
  company,
  contact,
  message,
  period,
  pushSubscription,
  request,
  user,
} from '../../infra/database/schema/index.js';
import { contactIdsOf, type ContactScope, type FirmScope } from '../auth/scope.js';

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

    const [pwdAccount] = await this.db
      .select({ id: account.id })
      .from(account)
      .innerJoin(contact, eq(contact.authUserId, account.userId))
      .where(and(eq(contact.id, first.contactId), isNotNull(account.password)))
      .limit(1);

    return {
      contactId: first.contactId,
      name: first.name,
      email: first.email,
      phone: first.phone,
      companyId: first.companyId,
      companyName: first.companyName,
      accountingFirmName: first.accountingFirmName,
      hasPassword: Boolean(pwdAccount),
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

  /** Revogação pelo Contador (F10-7): tira o vínculo, as sessões e as passkeys. Conceder
   *  acesso sem poder revogar é defeito de segurança, não falta de feature. */
  async revokeAccess(scope: FirmScope, companyId: string, contactId: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
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
        .limit(1)
        .for('update');

      if (!row) return undefined;
      if (!row.authUserId) return { revoked: false as const };

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
      
      return { revoked: true as const };
    });
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

  async findMembershipsByAuthUser(authUserId: string) {
    return this.db
      .select({ contactId: contact.id, companyId: company.id, active: company.active })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(eq(contact.authUserId, authUserId))
      .orderBy(asc(contact.createdAt), asc(contact.id));
  }

  async findUploadOwnership(authUserId: string, requestId: string) {
    const [row] = await this.db
      .select({ requestId: request.id, contactId: contact.id, active: company.active })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .innerJoin(request, eq(request.companyId, company.id))
      .where(and(eq(contact.authUserId, authUserId), eq(request.id, requestId)))
      .limit(1);

    return row;
  }

  async existsByAuthUser(authUserId: string) {
    const [row] = await this.db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.authUserId, authUserId))
      .limit(1);

    return Boolean(row);
  }
}
